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
