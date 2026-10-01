// The Healthway Pharmacy demo seed: it must land as a fully stocked,
// batch-tracked pharmacy whose historical sales all cleared FEFO, with the
// expiry watch having something real to say.
import { beforeEach, describe, expect, it } from 'vitest';
import { localAdapter } from './local';
import { loginOrCreatePharmacyDemo } from '../demo';

describe('pharmacy demo seed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds a pharmacy store with batches, sales and expiry situations', async () => {
    await loginOrCreatePharmacyDemo();

    const membership = await localAdapter.stores.getMyMembership(
      (await localAdapter.auth.getUser()).id
    );
    expect(membership.store.type).toBe('pharmacy');
    expect(membership.role).toBe('owner');

    const storeId = membership.store.id;
    const products = await localAdapter.products.list(storeId);
    const batches = await localAdapter.batches.list(storeId);
    const sales = await localAdapter.sales.list(storeId);

    // Every medicine opened with a batch, several with more than one.
    expect(products.length).toBeGreaterThanOrEqual(10);
    expect(batches.length).toBeGreaterThan(products.length);
    products.forEach((p) => {
      const own = batches.filter((b) => b.productId === p.id);
      expect(own.length).toBeGreaterThanOrEqual(1);
    });

    // The demo's teaching moments: an expired batch, a quarantined one,
    // and Rx medicines that gate the till.
    expect(batches.some((b) => b.expiryDate < new Date().toISOString().slice(0, 10))).toBe(true);
    expect(batches.some((b) => b.status === 'quarantined')).toBe(true);
    expect(products.some((p) => p.isRx)).toBe(true);

    // Historical sales recorded FEFO allocations and left stock consistent.
    expect(sales.length).toBeGreaterThan(5);
    const withAllocations = sales.filter((s) =>
      (s.items || []).some((i) => Array.isArray(i.batches) && i.batches.length > 0)
    );
    expect(withAllocations.length).toBeGreaterThan(0);
    products.forEach((p) => {
      const rollup = batches
        .filter((b) => b.productId === p.id && b.status === 'active')
        .reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
      expect(p.stock).toBe(rollup);
    });

    // Phase 2: the supply chain and a live part-dispensed prescription.
    const suppliers = await localAdapter.suppliers.list(storeId);
    const purchases = await localAdapter.purchases.list(storeId);
    expect(suppliers.length).toBeGreaterThanOrEqual(3);
    expect(purchases.length).toBeGreaterThanOrEqual(2);
    purchases.forEach((p) => {
      expect(p.total).toBe(p.items.reduce((s, i) => s + i.lineTotal, 0));
      // Every delivery line created a real, active batch.
      p.items.forEach((line) => {
        const batch = batches.find((b) => b.id === line.batchId);
        expect(batch).toBeTruthy();
        expect(batch.qty).toBeGreaterThanOrEqual(line.qty); // minus any sales since
        expect(batch.supplier).toBe(suppliers.find((s) => s.id === p.supplierId)?.name || '');
      });
    });

    const prescriptions = await localAdapter.prescriptions.list(storeId);
    expect(prescriptions.length).toBeGreaterThanOrEqual(1);
    const rx = prescriptions[0];
    expect(rx.status).toBe('open'); // part-dispensed, balance still owed
    const dispensedLine = rx.items.find((i) => i.dispensedQty > 0);
    expect(dispensedLine).toBeTruthy();
    expect(rx.items.some((i) => i.dispensedQty < i.prescribedQty)).toBe(true);

    const dispensings = await localAdapter.prescriptions.dispensings.list(storeId);
    expect(dispensings.length).toBeGreaterThanOrEqual(1);
    // The dispensing audit trail carries the receipt's batch allocations.
    expect(dispensings[0].items[0].batches.length).toBeGreaterThan(0);
    expect(sales.some((s) => s.receiptNo === dispensings[0].receiptNo)).toBe(true);
  });

  it('is idempotent: a second login reuses the seeded store untouched', async () => {
    await loginOrCreatePharmacyDemo();
    const first = (await localAdapter.sales.list(
      (await localAdapter.stores.getMyMembership(
        (await localAdapter.auth.getUser()).id
      )).store.id
    )).length;

    await localAdapter.auth.signOut();
    await loginOrCreatePharmacyDemo();
    const second = (await localAdapter.sales.list(
      (await localAdapter.stores.getMyMembership(
        (await localAdapter.auth.getUser()).id
      )).store.id
    )).length;

    expect(second).toBe(first);
  });
});
