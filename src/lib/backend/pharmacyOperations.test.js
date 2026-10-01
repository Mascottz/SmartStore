// src/lib/backend/pharmacyOperations.test.js
// Pharmacy Mode Phase 2 against the local adapter: suppliers, purchase
// receiving (deliveries become batches), structured prescriptions with
// part-dispensing, and the dispensing audit trail. The 011 migration's
// record_purchase RPC and prescription tables implement the same contract
// on Supabase; these tests pin the behaviour both sides promise.
import { beforeEach, describe, expect, it } from 'vitest';
import { localAdapter } from './local';

async function seedPharmacyStore() {
  await localAdapter.auth.signOut();
  const email = `pharm2-${Date.now()}@example.com`;
  await localAdapter.auth.signUp({ email, password: 'secret123' });
  const user = await localAdapter.auth.getUser();
  const store = await localAdapter.stores.create(user.id, email, {
    name: 'Healthway Pharmacy',
    type: 'pharmacy',
    categories: ['Prescription Drugs', 'Over-the-Counter'],
  });
  return store;
}

const iso = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

describe('local adapter: pharmacy operations (Phase 2)', () => {
  let store;

  beforeEach(async () => {
    localStorage.clear();
    store = await seedPharmacyStore();
  });

  it('manages suppliers and keeps deliveries readable when a supplier is removed', async () => {
    const emzor = await localAdapter.suppliers.create(store.id, {
      name: 'Emzor Pharmaceuticals',
      phone: '08030001122',
      notes: 'Delivers Tuesdays',
    });
    expect(emzor.name).toBe('Emzor Pharmaceuticals');
    expect(await localAdapter.suppliers.list(store.id)).toHaveLength(1);

    await localAdapter.suppliers.update(emzor.id, { phone: '08030009999' });
    expect((await localAdapter.suppliers.list(store.id))[0].phone).toBe('08030009999');

    // A delivery linked to the supplier survives the supplier's removal;
    // only the link is cleared, the ledger row and its lines stay.
    const product = await localAdapter.products.create(store.id, {
      name: 'Amoxil 500mg',
      costPrice: 3200,
      salePrice: 4500,
      stock: 0,
    });
    await localAdapter.purchases.create(store.id, {
      supplierId: emzor.id,
      reference: 'EMZ-INV-1',
      items: [
        {
          productId: product.id,
          name: product.name,
          qty: 10,
          unitCost: 3200,
          batchNo: 'AMX-1',
          expiryDate: iso(300),
          supplier: 'Emzor Pharmaceuticals',
        },
      ],
      receivedBy: 'owner@example.com',
    });

    await localAdapter.suppliers.remove(emzor.id);
    expect(await localAdapter.suppliers.list(store.id)).toHaveLength(0);

    const purchases = await localAdapter.purchases.list(store.id);
    expect(purchases).toHaveLength(1);
    expect(purchases[0].supplierId).toBeNull();
    // The supplier name survives on the line — the trace stays readable.
    expect(purchases[0].items[0].name).toBe('Amoxil 500mg');
  });

  it('records a delivery: every line becomes a batch and the rollup moves', async () => {
    const amoxil = await localAdapter.products.create(store.id, {
      name: 'Amoxil 500mg',
      costPrice: 3200,
      salePrice: 4500,
      stock: 0,
    });
    const vitaminC = await localAdapter.products.create(store.id, {
      name: 'Vitamin C 100mg',
      costPrice: 600,
      salePrice: 950,
      stock: 0,
    });

    const purchase = await localAdapter.purchases.create(store.id, {
      supplierId: null,
      reference: 'WB-88',
      items: [
        {
          productId: amoxil.id,
          name: amoxil.name,
          qty: 40,
          unitCost: 3200,
          batchNo: 'AMX-2430',
          expiryDate: iso(200),
        },
        {
          productId: vitaminC.id,
          name: vitaminC.name,
          qty: 25,
          unitCost: 600,
          batchNo: 'VC-51',
          expiryDate: iso(90),
        },
      ],
      receivedBy: 'owner@example.com',
    });

    expect(purchase.status).toBe('received');
    expect(purchase.total).toBe(40 * 3200 + 25 * 600);
    expect(purchase.items).toHaveLength(2);
    // Each line is back-filled with the batch it created.
    for (const line of purchase.items) {
      expect(line.batchId).toBeTruthy();
      expect(line.batchNo).toBeTruthy();
      expect(line.expiryDate).toBeTruthy();
      expect(line.lineTotal).toBe(line.qty * line.unitCost);
    }

    const batches = await localAdapter.batches.list(store.id);
    expect(batches).toHaveLength(2);
    const amx = batches.find((b) => b.batchNo === 'AMX-2430');
    expect(amx.qty).toBe(40);
    expect(amx.costPrice).toBe(3200);
    expect(amx.status).toBe('active');

    const products = await localAdapter.products.list(store.id);
    expect(products.find((p) => p.id === amoxil.id).stock).toBe(40);
    expect(products.find((p) => p.id === vitaminC.id).stock).toBe(25);
    expect(products.find((p) => p.id === vitaminC.id).expiryDate).toBe(iso(90));

    // Received stock is immediately sellable through the normal engine.
    const sale = await localAdapter.sales.create(store.id, {
      items: [
        { productId: amoxil.id, name: amoxil.name, qty: 5, price: 4500, lineTotal: 22500 },
      ],
      paymentMethod: 'Cash',
      receiptNo: 'SM-P2A',
      trackStock: true,
    });
    expect(sale.items[0].batches[0].batchNo).toBe('AMX-2430');

    // Deleting the purchase is ledger-only: batches and stock survive.
    await localAdapter.purchases.remove(purchase.id);
    expect(await localAdapter.purchases.list(store.id)).toHaveLength(0);
    expect(await localAdapter.batches.list(store.id)).toHaveLength(2);
    expect((await localAdapter.products.list(store.id)).find((p) => p.id === amoxil.id).stock).toBe(35);
  });

  it('dispenses a prescription in parts and closes it when complete', async () => {
    const al = await localAdapter.products.create(store.id, {
      name: 'Artemether-Lumefantrine',
      costPrice: 900,
      salePrice: 1300,
      isRx: true,
      openingBatch: { qty: 12, batchNo: 'AL-1', expiryDate: iso(60) },
    });
    const ors = await localAdapter.products.create(store.id, {
      name: 'ORS Sachets',
      costPrice: 150,
      salePrice: 250,
      openingBatch: { qty: 50, batchNo: 'ORS-1', expiryDate: iso(400) },
    });

    const rx = await localAdapter.prescriptions.create(store.id, {
      patientName: 'Mr. Musa Ibrahim',
      prescriber: 'Dr. Eze, Lagoon Clinic',
      items: [
        { productId: al.id, name: al.name, qty: 2 },
        { productId: ors.id, name: ors.name, qty: 4 },
      ],
      createdBy: 'owner@example.com',
    });
    expect(rx.code).toMatch(/^RX-/);
    expect(rx.status).toBe('open');
    expect(rx.items).toHaveLength(2);
    expect(rx.items.map((i) => i.prescribedQty).sort()).toEqual([2, 4]);

    // First visit: part of the course only.
    const first = await localAdapter.prescriptions.dispense(store.id, {
      prescriptionId: rx.id,
      lines: [{ productId: al.id, qty: 2 }],
      paymentMethod: 'Cash',
      cashierEmail: 'cashier@example.com',
    });
    expect(first.prescription.status).toBe('open');
    const alItem = first.prescription.items.find((i) => i.productId === al.id);
    expect(alItem.dispensedQty).toBe(2);
    expect(first.sale.receiptNo).toMatch(/^SM-/);
    expect(first.sale.items[0].isRx).toBe(true);
    // The sale ran FEFO through the normal engine: stock moved.
    expect((await localAdapter.products.list(store.id)).find((p) => p.id === al.id).stock).toBe(10);

    // Over-dispensing past the prescribed balance is refused.
    await expect(
      localAdapter.prescriptions.dispense(store.id, {
        prescriptionId: rx.id,
        lines: [{ productId: al.id, qty: 1 }],
        paymentMethod: 'Cash',
        cashierEmail: 'cashier@example.com',
      })
    ).rejects.toThrow(/remain on this prescription/i);

    // Second visit: the balance completes the script.
    const second = await localAdapter.prescriptions.dispense(store.id, {
      prescriptionId: rx.id,
      lines: [{ productId: ors.id, qty: 4 }],
      paymentMethod: 'Transfer',
      cashierEmail: 'cashier@example.com',
    });
    expect(second.prescription.status).toBe('dispensed');

    // A completed script cannot be dispensed again or cancelled.
    await expect(
      localAdapter.prescriptions.dispense(store.id, {
        prescriptionId: rx.id,
        lines: [{ productId: ors.id, qty: 1 }],
        paymentMethod: 'Cash',
        cashierEmail: 'cashier@example.com',
      })
    ).rejects.toThrow(/not open for dispensing/i);
    await expect(localAdapter.prescriptions.cancel(rx.id)).rejects.toThrow(
      /already been fully dispensed/i
    );

    // The audit trail links both visits to their receipts, with the batch
    // allocations the sale engine made.
    const dispensings = await localAdapter.prescriptions.dispensings.list(store.id);
    expect(dispensings).toHaveLength(2);
    expect(dispensings.every((d) => d.prescriptionId === rx.id)).toBe(true);
    expect(dispensings[0].items[0].batches[0].batchNo).toBe('ORS-1');
    expect(dispensings.map((d) => d.receiptNo)).toContain(first.sale.receiptNo);

    // Stock moved twice, exactly.
    expect((await localAdapter.products.list(store.id)).find((p) => p.id === ors.id).stock).toBe(46);

    // Cancelling an open script keeps what was dispensed on the books.
    const rx2 = await localAdapter.prescriptions.create(store.id, {
      patientName: 'Mrs. Bello',
      items: [{ productId: ors.id, name: ors.name, qty: 2 }],
      createdBy: 'owner@example.com',
    });
    await localAdapter.prescriptions.cancel(rx2.id);
    const listed = await localAdapter.prescriptions.list(store.id);
    expect(listed.find((r) => r.id === rx2.id).status).toBe('cancelled');
    expect(listed.find((r) => r.id === rx.id).status).toBe('dispensed');
  });

  it('blocks dispensing from recalled batches', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Cough Syrup 100ml',
      costPrice: 400,
      salePrice: 650,
      openingBatch: { qty: 10, batchNo: 'CS-1', expiryDate: iso(120) },
    });
    const batches = await localAdapter.batches.list(store.id);
    await localAdapter.batches.update(batches[0].id, { status: 'recalled' });

    // Recalled stock leaves the rollup...
    expect((await localAdapter.products.list(store.id))[0].stock).toBe(0);
    // ...and cannot be dispensed against a prescription.
    const rx = await localAdapter.prescriptions.create(store.id, {
      patientName: 'Mr. Danjuma',
      items: [{ productId: product.id, name: product.name, qty: 1 }],
      createdBy: 'owner@example.com',
    });
    await expect(
      localAdapter.prescriptions.dispense(store.id, {
        prescriptionId: rx.id,
        lines: [{ productId: product.id, qty: 1 }],
        paymentMethod: 'Cash',
        cashierEmail: 'cashier@example.com',
      })
    ).rejects.toThrow(/in-date/i);
  });
});
