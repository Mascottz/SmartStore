// src/lib/backend/pharmacyControlled.test.js
// Pharmacy Mode Phase 3 against the local adapter: the controlled-medicine
// flag, pharmacist flags on the team, and the verifying pharmacist recorded
// on sales + dispensings for the controlled register. 012's RPCs and columns
// implement the same contract on Supabase.
import { beforeEach, describe, expect, it } from 'vitest';
import { localAdapter } from './local';

async function seedPharmacyStore() {
  await localAdapter.auth.signOut();
  const email = `pharm3-${Date.now()}@example.com`;
  await localAdapter.auth.signUp({ email, password: 'secret123' });
  const user = await localAdapter.auth.getUser();
  const store = await localAdapter.stores.create(user.id, email, {
    name: 'Healthway Pharmacy',
    type: 'pharmacy',
    categories: ['Prescription Drugs'],
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

describe('local adapter: controlled medicines & pharmacist oversight', () => {
  let store;

  beforeEach(async () => {
    localStorage.clear();
    store = await seedPharmacyStore();
  });

  it('marks medicines as controlled and edits the flag', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Tramadol 50mg Cap',
      costPrice: 1200,
      salePrice: 1800,
      isRx: true,
      isControlled: true,
      openingBatch: { qty: 25, batchNo: 'TRA-11', expiryDate: iso(300) },
    });
    expect(product.isControlled).toBe(true);

    const tramadol = (await localAdapter.products.list(store.id))[0];
    expect(tramadol.isControlled).toBe(true);

    await localAdapter.products.update(product.id, { isControlled: false });
    expect((await localAdapter.products.list(store.id))[0].isControlled).toBe(false);

    // Plain medicines default to not controlled, as before.
    const plain = await localAdapter.products.create(store.id, {
      name: 'Paracetamol',
      costPrice: 5,
      salePrice: 10,
      stock: 10,
    });
    expect(plain.isControlled).toBe(false);
  });

  it('records the verifying pharmacist on the sale', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Tramadol 50mg Cap',
      costPrice: 1200,
      salePrice: 1800,
      isControlled: true,
      openingBatch: { qty: 25, batchNo: 'TRA-11', expiryDate: iso(300) },
    });

    const sale = await localAdapter.sales.create(store.id, {
      items: [
        {
          productId: product.id,
          name: product.name,
          qty: 2,
          price: 1800,
          lineTotal: 3600,
          isControlled: true,
        },
      ],
      paymentMethod: 'Cash',
      receiptNo: 'SM-CD1',
      trackStock: true,
      verifiedBy: 'pharmacist@healthway.ng',
    });

    expect(sale.verifiedBy).toBe('pharmacist@healthway.ng');
    // The controlled flag travels with the line for the register.
    expect(sale.items[0].isControlled).toBe(true);
    expect(sale.items[0].batches[0].batchNo).toBe('TRA-11');

    const listed = (await localAdapter.sales.list(store.id))[0];
    expect(listed.verifiedBy).toBe('pharmacist@healthway.ng');

    // Sales without a verifier stay empty, not undefined.
    const plain = await localAdapter.sales.create(store.id, {
      items: [
        { productId: product.id, name: product.name, qty: 1, price: 1800, lineTotal: 1800 },
      ],
      paymentMethod: 'Cash',
      receiptNo: 'SM-CD2',
      trackStock: true,
    });
    expect(plain.verifiedBy).toBe('');
  });

  it('flags team members as pharmacists, independent of role', async () => {
    const team = await localAdapter.team.list(store.id);
    expect(team).toHaveLength(1);
    expect(team[0].role).toBe('owner');
    expect(team[0].isPharmacist).toBeFalsy();

    const updated = await localAdapter.team.setPharmacist(team[0].id, true);
    expect(updated.isPharmacist).toBe(true);

    const after = (await localAdapter.team.list(store.id))[0];
    expect(after.isPharmacist).toBe(true);
    expect(after.role).toBe('owner'); // role untouched

    await localAdapter.team.setPharmacist(team[0].id, false);
    expect((await localAdapter.team.list(store.id))[0].isPharmacist).toBe(false);
  });

  it('carries the verifier through prescription dispensings', async () => {
    const tramadol = await localAdapter.products.create(store.id, {
      name: 'Tramadol 50mg Cap',
      costPrice: 1200,
      salePrice: 1800,
      isRx: true,
      isControlled: true,
      openingBatch: { qty: 25, batchNo: 'TRA-11', expiryDate: iso(300) },
    });

    const rx = await localAdapter.prescriptions.create(store.id, {
      patientName: 'Mrs. Iyabo Ogun',
      prescriber: 'Dr. Bello, Unity Hospital',
      items: [{ productId: tramadol.id, name: tramadol.name, qty: 2 }],
      createdBy: 'owner@example.com',
    });

    const { sale, prescription } = await localAdapter.prescriptions.dispense(store.id, {
      prescriptionId: rx.id,
      lines: [{ productId: tramadol.id, qty: 2 }],
      paymentMethod: 'Cash',
      cashierEmail: 'cashier@example.com',
      verifiedBy: 'pharmacist@healthway.ng',
    });

    expect(prescription.status).toBe('dispensed');
    expect(sale.verifiedBy).toBe('pharmacist@healthway.ng');
    expect(sale.items[0].isControlled).toBe(true);

    // The register's source of truth: the sale list + dispensing trail.
    const sales = await localAdapter.sales.list(store.id);
    const controlled = sales.filter((s) =>
      (s.items || []).some((i) => i.isControlled)
    );
    expect(controlled).toHaveLength(1);
    expect(controlled[0].verifiedBy).toBe('pharmacist@healthway.ng');
    expect(
      controlled[0].items.filter((i) => i.isControlled)[0].batches
    ).toEqual([expect.objectContaining({ batchNo: 'TRA-11', qty: 2 })]);
  });
});
