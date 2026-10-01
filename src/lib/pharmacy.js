// src/lib/pharmacy.js
// Pharmacy Mode domain logic, shared by the POS preview, the local
// (localStorage) backend and the UI. The Supabase RPCs implement the same
// rules in SQL - keep them in sync when changing anything here.
//
// The core model: a pharmacy product's stock lives in *batches*. Each batch
// carries its own batch number, expiry date, quantity and supplier. Selling
// follows FEFO (first-expiry-first-out): the batch that expires soonest is
// sold first, so stock rotates naturally and nothing expires on the shelf.
//
// `products.stock` remains the single rollup the rest of SmartStore already
// reads (POS tiles, dashboards, reports): it is the sum of the product's
// active batches, and `products.expiryDate` mirrors the earliest active
// batch expiry so every existing expiry display keeps working.

// How many days out a batch counts as "expiring soon" (amber warnings).
export const EXPIRY_WARNING_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `today` (local midnight) until `dateStr` (a plain
 * YYYY-MM-DD). Negative means already past. Null when the date is missing
 * or unparseable. Calendar-day maths (not raw ms division) so time of day
 * never shifts a batch across a day boundary.
 */
export function daysUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - base.getTime()) / MS_PER_DAY);
}

/** A batch with no expiry date is never "expired" - it just sorts last. */
export function isExpired(batch, today = new Date()) {
  const days = daysUntil(batch?.expiryDate, today);
  return days != null && days < 0;
}

export function isActiveBatch(batch) {
  return (batch?.status || 'active') === 'active';
}

/**
 * FEFO comparator: earliest expiry first, batches without an expiry date
 * last (they cannot expire, so dated stock should move before them).
 */
function fefoCompare(a, b) {
  const ax = a.expiryDate || '9999-12-31';
  const bx = b.expiryDate || '9999-12-31';
  if (ax !== bx) return ax < bx ? -1 : 1;
  return String(a.batchNo || '').localeCompare(String(b.batchNo || ''));
}

/**
 * Batches that can be dispensed right now: active, not expired, with stock.
 * Sorted FEFO so simply walking the list allocates correctly.
 */
export function sellableBatches(batches, today = new Date()) {
  return (Array.isArray(batches) ? batches : [])
    .filter(
      (b) =>
        isActiveBatch(b) &&
        !isExpired(b, today) &&
        (Number(b.qty) || 0) > 0
    )
    .sort(fefoCompare);
}

/** Total units dispensable right now (what the POS caps a cart line at). */
export function sellableQty(batches, today = new Date()) {
  return sellableBatches(batches, today).reduce(
    (sum, b) => sum + (Number(b.qty) || 0),
    0
  );
}

/**
 * Split `qty` across the product's batches FEFO. Returns the allocations
 * (each carrying enough batch identity for receipts, recalls and voids) and
 * how many units could not be covered - `remaining` > 0 means the sale must
 * be refused or the quantity reduced.
 */
export function allocateFefo(batches, qty, today = new Date()) {
  const wanted = Math.max(0, Math.floor(Number(qty) || 0));
  const allocations = [];
  let remaining = wanted;
  for (const b of sellableBatches(batches, today)) {
    if (remaining <= 0) break;
    const take = Math.min(Number(b.qty) || 0, remaining);
    allocations.push({
      batchId: b.id,
      batchNo: b.batchNo || '',
      expiryDate: b.expiryDate || null,
      qty: take,
    });
    remaining -= take;
  }
  return { allocations, remaining };
}

/**
 * Which expiry bucket a date falls into: 'expired', 'd30', 'd60', 'd90',
 * 'ok' (beyond the warning window) or 'none' (no date known).
 */
export function expiryBucket(dateStr, today = new Date()) {
  const days = daysUntil(dateStr, today);
  if (days == null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'ok';
}

export const EXPIRY_BUCKETS = [
  { key: 'expired', label: 'Expired', tone: 'red' },
  { key: 'd30', label: '≤ 30 days', tone: 'red' },
  { key: 'd60', label: '≤ 60 days', tone: 'amber' },
  { key: 'd90', label: '≤ 90 days', tone: 'amber' },
];

/**
 * Earliest expiry among the product's active batches (expired ones
 * included, so an expired batch still surfaces as a red warning rather
 * than disappearing). Null when no active batch carries a date.
 */
export function earliestActiveExpiry(batches) {
  const dates = (Array.isArray(batches) ? batches : [])
    .filter(isActiveBatch)
    .map((b) => (b.expiryDate ? String(b.expiryDate).slice(0, 10) : null))
    .filter(Boolean)
    .sort();
  return dates[0] || null;
}

/** Human label for a batch's current state, used in tables and chips. */
export function batchStatusLabel(batch, today = new Date()) {
  if (!isActiveBatch(batch)) {
    return batch?.status === 'recalled' ? 'Recalled' : 'Quarantined';
  }
  if ((Number(batch?.qty) || 0) <= 0) return 'Depleted';
  const days = daysUntil(batch.expiryDate, today);
  if (days == null) return 'Active';
  if (days < 0) return 'Expired';
  if (days <= EXPIRY_WARNING_DAYS) return `Expires in ${days} day${days === 1 ? '' : 's'}`;
  return 'Active';
}
