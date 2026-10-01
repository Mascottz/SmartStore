// src/lib/backend/pharmacyBatches.test.js
// Pharmacy Mode against the local adapter: opening batches, FEFO sales,
// expired/quarantined stock, void restoration and the product rollup.
// The Supabase RPCs in 010_pharmacy_mode.sql implement the same rules;
// these tests pin the behaviour both sides promise.
import { beforeEach, describe, expect, it } from 'vitest';
import { localAdapter } from './local';

async function seedPharmacyStore() {
  await localAdapter.auth.signOut();
  // Sign up creates the account; creating the store makes this user its
  // owner so product/batch writes pass the adapter's membership checks.
  const email = `pharm-${Date.now()}@example.com`;
  await localAdapter.auth.signUp({ email, password: 'secret123' });
  const user = await localAdapter.auth.getUser();
  const store = await localAdapter.stores.create(user.id, email, {
    name: 'Healthway Pharmacy',
    type: 'pharmacy',
    categories: ['Over-the-Counter'],
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

describe('local adapter: pharmacy batches', () => {
  let store;

  beforeEach(async () => {
    localStorage.clear();
    store = await seedPharmacyStore();
  });

  it('creates a medicine with an opening batch and rolls stock up', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Amoxicillin 500mg Caps',
      category: 'Prescription Drugs',
      costPrice: 30,
      salePrice: 50,
      isRx: true,
      strength: '500 mg',
      dosageForm: 'Capsule',
      openingBatch: { qty: 100, batchNo: 'B-2419', expiryDate: iso(120), supplier: 'Emzor' },
    });

    expect(product.stock).toBe(100);
    expect(product.expiryDate).toBe(iso(120));
    expect(product.isRx).toBe(true);

    const batches = await localAdapter.batches.list(store.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].batchNo).toBe('B-2419');
    expect(batches[0].qty).toBe(100);
    expect(batches[0].productId).toBe(product.id);
  });

  it('sells FEFO from the soonest-expiring batch and records the allocation', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Paracetamol 500mg Tab',
      costPrice: 5,
      salePrice: 10,
      openingBatch: { qty: 30, batchNo: 'LATER', expiryDate: iso(300) },
    });
    await localAdapter.batches.add(store.id, {
      productId: product.id,
      qty: 20,
      batchNo: 'SOON',
      expiryDate: iso(20),
    });

    const sale = await localAdapter.sales.create(store.id, {
      items: [
        {
          productId: product.id,
          name: product.name,
          qty: 25,
          price: 10,
          lineTotal: 250,
        },
      ],
      paymentMethod: 'Cash',
      receiptNo: 'SM-0001',
      trackStock: true,
    });

    // FEFO: 20 from the soonest batch, 5 from the later one.
    expect(sale.items[0].batches).toEqual([
      expect.objectContaining({ batchNo: 'SOON', qty: 20 }),
      expect.objectContaining({ batchNo: 'LATER', qty: 5 }),
    ]);

    const batches = await localAdapter.batches.list(store.id);
    expect(batches.find((b) => b.batchNo === 'SOON').qty).toBe(0);
    expect(batches.find((b) => b.batchNo === 'LATER').qty).toBe(25);

    const refreshed = (await localAdapter.products.list(store.id))[0];
    expect(refreshed.stock).toBe(25);
    expect(refreshed.expiryDate).toBe(iso(300));
  });

  it('refuses to sell stock that is expired or quarantined', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Cough Syrup 100ml',
      costPrice: 400,
      salePrice: 650,
      openingBatch: { qty: 10, batchNo: 'EXPIRED', expiryDate: iso(-3) },
    });

    await expect(
      localAdapter.sales.create(store.id, {
        items: [{ productId: product.id, name: product.name, qty: 1, price: 650, lineTotal: 650 }],
        paymentMethod: 'Cash',
        receiptNo: 'SM-0002',
        trackStock: true,
      })
    ).rejects.toThrow(/in-date/i);

    // Quarantine is equally blocking, even with a future expiry.
    await localAdapter.batches.add(store.id, {
      productId: product.id,
      qty: 50,
      batchNo: 'GOOD',
      expiryDate: iso(200),
    });
    await localAdapter.batches.update(
      (await localAdapter.batches.list(store.id)).find((b) => b.batchNo === 'GOOD').id,
      { status: 'quarantined' }
    );

    await expect(
      localAdapter.sales.create(store.id, {
        items: [{ productId: product.id, name: product.name, qty: 1, price: 650, lineTotal: 650 }],
        paymentMethod: 'Cash',
        receiptNo: 'SM-0003',
        trackStock: true,
      })
    ).rejects.toThrow(/in-date/i);
  });

  it('restores exact batches when a sale is voided', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Artemether-Lumefantrine',
      costPrice: 900,
      salePrice: 1300,
      openingBatch: { qty: 12, batchNo: 'AL-1', expiryDate: iso(60) },
    });

    const sale = await localAdapter.sales.create(store.id, {
      items: [{ productId: product.id, name: product.name, qty: 7, price: 1300, lineTotal: 9100 }],
      paymentMethod: 'Cash',
      receiptNo: 'SM-0004',
      trackStock: true,
    });
    expect((await localAdapter.products.list(store.id))[0].stock).toBe(5);

    await localAdapter.sales.void(sale.id, 'Wrong item', 'owner@example.com', true);

    expect((await localAdapter.products.list(store.id))[0].stock).toBe(12);
    const batches = await localAdapter.batches.list(store.id);
    expect(batches.find((b) => b.batchNo === 'AL-1').qty).toBe(12);
  });

  it('keeps the rollup honest when batches are edited, quarantined or removed', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Vitamin C 100mg',
      costPrice: 60,
      salePrice: 100,
      openingBatch: { qty: 40, batchNo: 'VC-1', expiryDate: iso(400) },
    });
    await localAdapter.batches.add(store.id, {
      productId: product.id,
      qty: 60,
      batchNo: 'VC-2',
      expiryDate: iso(45),
    });
    expect((await localAdapter.products.list(store.id))[0].stock).toBe(100);
    expect((await localAdapter.products.list(store.id))[0].expiryDate).toBe(iso(45));

    // Quarantine one batch: its units leave the sellable rollup.
    const batches = await localAdapter.batches.list(store.id);
    const vc2 = batches.find((b) => b.batchNo === 'VC-2');
    await localAdapter.batches.update(vc2.id, { status: 'quarantined' });
    expect((await localAdapter.products.list(store.id))[0].stock).toBe(40);
    expect((await localAdapter.products.list(store.id))[0].expiryDate).toBe(iso(400));

    // Removing it entirely has the same effect on the rollup.
    await localAdapter.batches.remove(vc2.id);
    expect((await localAdapter.products.list(store.id))[0].stock).toBe(40);

    // Deleting the product takes its batches with it.
    await localAdapter.products.remove(product.id);
    expect(await localAdapter.batches.list(store.id)).toHaveLength(0);
  });

  it('keeps plain products working exactly as before (no batches)', async () => {
    const product = await localAdapter.products.create(store.id, {
      name: 'Plaster Strip',
      costPrice: 50,
      salePrice: 90,
      stock: 10,
    });

    const sale = await localAdapter.sales.create(store.id, {
      items: [{ productId: product.id, name: product.name, qty: 4, price: 90, lineTotal: 360 }],
      paymentMethod: 'Cash',
      receiptNo: 'SM-0005',
      trackStock: true,
    });
    expect(sale.items[0].batches).toBeUndefined();
    expect((await localAdapter.products.list(store.id))[0].stock).toBe(6);

    await expect(
      localAdapter.sales.create(store.id, {
        items: [{ productId: product.id, name: product.name, qty: 7, price: 90, lineTotal: 630 }],
        paymentMethod: 'Cash',
        receiptNo: 'SM-0006',
        trackStock: true,
      })
    ).rejects.toThrow(/Insufficient stock/i);
  });
});
