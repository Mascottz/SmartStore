// src/lib/pharmacy.test.js
// Pure domain rules for Pharmacy Mode: FEFO allocation, expiry maths and
// batch statuses. These are the rules both backends implement; if one of
// these changes, the SQL twin in 010_pharmacy_mode.sql changes with it.
import { describe, expect, it } from 'vitest';
import {
  allocateFefo,
  batchStatusLabel,
  daysUntil,
  earliestActiveExpiry,
  expiryBucket,
  isExpired,
  sellableBatches,
  sellableQty,
} from './pharmacy';

// A fixed "today" so date-boundary behaviour is deterministic.
const TODAY = new Date(2026, 0, 15); // 2026-01-15, local time

const iso = (daysFromToday) => {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const batch = (overrides = {}) => ({
  id: `b-${Math.random().toString(36).slice(2, 8)}`,
  batchNo: 'B-1',
  expiryDate: iso(100),
  qty: 10,
  status: 'active',
  ...overrides,
});

describe('daysUntil', () => {
  it('counts whole calendar days and handles missing dates', () => {
    expect(daysUntil(iso(0), TODAY)).toBe(0);
    expect(daysUntil(iso(1), TODAY)).toBe(1);
    expect(daysUntil(iso(-1), TODAY)).toBe(-1);
    expect(daysUntil(iso(90), TODAY)).toBe(90);
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('not-a-date', TODAY)).toBeNull();
  });
});

describe('isExpired / expiryBucket', () => {
  it('treats a batch with no expiry date as never expired', () => {
    expect(isExpired(batch({ expiryDate: null }), TODAY)).toBe(false);
    expect(expiryBucket(null, TODAY)).toBe('none');
  });

  it('flags past dates as expired regardless of how far', () => {
    expect(isExpired(batch({ expiryDate: iso(-1) }), TODAY)).toBe(true);
    expect(isExpired(batch({ expiryDate: iso(-400) }), TODAY)).toBe(true);
    expect(expiryBucket(iso(-1), TODAY)).toBe('expired');
  });

  it('buckets the warning windows at their edges', () => {
    expect(expiryBucket(iso(0), TODAY)).toBe('d30');
    expect(expiryBucket(iso(30), TODAY)).toBe('d30');
    expect(expiryBucket(iso(31), TODAY)).toBe('d60');
    expect(expiryBucket(iso(60), TODAY)).toBe('d60');
    expect(expiryBucket(iso(61), TODAY)).toBe('d90');
    expect(expiryBucket(iso(91), TODAY)).toBe('ok');
  });
});

describe('sellableBatches', () => {
  it('only includes active, in-date batches with stock, sorted FEFO', () => {
    const b1 = batch({ batchNo: 'LATE', expiryDate: iso(200), qty: 5 });
    const b2 = batch({ batchNo: 'SOON', expiryDate: iso(10), qty: 5 });
    const b3 = batch({ batchNo: 'GONE', expiryDate: iso(5), qty: 0 });
    const b4 = batch({ batchNo: 'OLD', expiryDate: iso(-5), qty: 5 });
    const b5 = batch({ batchNo: 'Q', expiryDate: iso(3), qty: 5, status: 'quarantined' });
    const b6 = batch({ batchNo: 'NODATE', expiryDate: null, qty: 5 });

    const sellable = sellableBatches([b1, b2, b3, b4, b5, b6], TODAY);
    expect(sellable.map((b) => b.batchNo)).toEqual(['SOON', 'LATE', 'NODATE']);
  });
});

describe('allocateFefo', () => {
  it('allocates from the soonest-expiring batch first', () => {
    const soon = batch({ batchNo: 'SOON', expiryDate: iso(30), qty: 10 });
    const later = batch({ batchNo: 'LATER', expiryDate: iso(300), qty: 10 });
    const { allocations, remaining } = allocateFefo([later, soon], 4, TODAY);
    expect(remaining).toBe(0);
    expect(allocations).toEqual([
      { batchId: soon.id, batchNo: 'SOON', expiryDate: soon.expiryDate, qty: 4 },
    ]);
  });

  it('splits across batches when the first runs out', () => {
    const soon = batch({ batchNo: 'SOON', expiryDate: iso(30), qty: 3 });
    const later = batch({ batchNo: 'LATER', expiryDate: iso(300), qty: 10 });
    const { allocations, remaining } = allocateFefo([later, soon], 8, TODAY);
    expect(remaining).toBe(0);
    expect(allocations).toEqual([
      { batchId: soon.id, batchNo: 'SOON', expiryDate: soon.expiryDate, qty: 3 },
      { batchId: later.id, batchNo: 'LATER', expiryDate: later.expiryDate, qty: 5 },
    ]);
  });

  it('never allocates expired or quarantined stock', () => {
    const expired = batch({ batchNo: 'EXPIRED', expiryDate: iso(-1), qty: 100 });
    const quarantined = batch({
      batchNo: 'Q',
      expiryDate: iso(10),
      qty: 100,
      status: 'quarantined',
    });
    const { allocations, remaining } = allocateFefo([expired, quarantined], 5, TODAY);
    expect(allocations).toEqual([]);
    expect(remaining).toBe(5);
  });

  it('reports what could not be covered', () => {
    const only = batch({ qty: 2 });
    const { allocations, remaining } = allocateFefo([only], 6, TODAY);
    expect(allocations[0].qty).toBe(2);
    expect(remaining).toBe(4);
  });

  it('treats batches without an expiry date as last in line', () => {
    const noDate = batch({ batchNo: 'NODATE', expiryDate: null, qty: 10 });
    const dated = batch({ batchNo: 'DATED', expiryDate: iso(60), qty: 2 });
    const { allocations } = allocateFefo([noDate, dated], 5, TODAY);
    expect(allocations.map((a) => a.batchNo)).toEqual(['DATED', 'NODATE']);
    expect(allocations[1].qty).toBe(3);
  });
});

describe('sellableQty', () => {
  it('sums only in-date, active stock', () => {
    expect(
      sellableQty(
        [
          batch({ qty: 5 }),
          batch({ qty: 5, expiryDate: iso(-1) }),
          batch({ qty: 5, status: 'quarantined' }),
        ],
        TODAY
      )
    ).toBe(5);
  });
});

describe('earliestActiveExpiry', () => {
  it('returns the soonest expiry among active batches, ignoring others', () => {
    expect(
      earliestActiveExpiry([
        batch({ expiryDate: iso(300) }),
        batch({ expiryDate: iso(-10) }), // expired but still active → surfaces
        batch({ expiryDate: iso(5), status: 'quarantined' }),
      ])
    ).toBe(iso(-10));
  });

  it('is null when no active batch carries a date', () => {
    expect(earliestActiveExpiry([batch({ expiryDate: null })])).toBeNull();
    expect(earliestActiveExpiry([])).toBeNull();
  });
});

describe('batchStatusLabel', () => {
  it('names every real state a batch can be in', () => {
    expect(batchStatusLabel(batch({ status: 'quarantined' }), TODAY)).toBe('Quarantined');
    expect(batchStatusLabel(batch({ status: 'recalled' }), TODAY)).toBe('Recalled');
    expect(batchStatusLabel(batch({ qty: 0 }), TODAY)).toBe('Depleted');
    expect(batchStatusLabel(batch({ expiryDate: iso(-1) }), TODAY)).toBe('Expired');
    expect(batchStatusLabel(batch({ expiryDate: iso(7) }), TODAY)).toBe('Expires in 7 days');
    expect(batchStatusLabel(batch({ expiryDate: iso(1) }), TODAY)).toBe('Expires in 1 day');
    expect(batchStatusLabel(batch({ expiryDate: null }), TODAY)).toBe('Active');
    expect(batchStatusLabel(batch({ expiryDate: iso(400) }), TODAY)).toBe('Active');
  });
});
