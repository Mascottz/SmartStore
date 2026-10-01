// src/components/BatchDrawer.jsx
// Pharmacy Mode: the per-product batch manager. This is where pharmacy
// stock actually lives — every delivery arrives as a batch with its own
// number, expiry date, quantity, cost and supplier, and every sale is
// allocated from these batches FEFO (soonest expiry first).
//
// Opened from the Inventory table's batch action.
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  Pencil,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';
import { sanitize } from '../lib/validate';
import {
  batchStatusLabel,
  daysUntil,
  expiryBucket,
  isActiveBatch,
  sellableBatches,
} from '../lib/pharmacy';

const inputCls =
  'w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

const emptyReceive = {
  qty: '',
  batchNo: '',
  expiryDate: '',
  costPrice: '',
  supplier: '',
};

const emptyEdit = {
  batchNo: '',
  expiryDate: '',
  qty: '',
  costPrice: '',
  supplier: '',
};

/**
 * Small status chip. Tone comes from the batch's real state, not just its
 * status column: an active batch that expired is the loudest thing on the
 * screen.
 */
function BatchStatusChip({ batch }) {
  const label = batchStatusLabel(batch);
  const bucket = expiryBucket(batch.expiryDate);
  const tone = !isActiveBatch(batch)
    ? 'bg-zinc-500/10 text-zinc-500'
    : bucket === 'expired'
      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
      : bucket === 'd30' || bucket === 'd60'
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  return (
    <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${tone}`}>
      {label}
    </span>
  );
}

export default function BatchDrawer({ product, batches = [], onClose }) {
  const [receive, setReceive] = useState(emptyReceive);
  const [receiving, setReceiving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(emptyEdit);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const productId = product?.id;
  const storeId = product?.storeId;

  const productBatches = useMemo(
    () => (batches || []).filter((b) => b.productId === productId),
    [batches, productId]
  );

  const today = new Date();
  const sellable = sellableBatches(productBatches, today);
  const sellableCount = sellable.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
  const totalUnits = productBatches.reduce(
    (sum, b) => (isActiveBatch(b) ? sum + (Number(b.qty) || 0) : sum),
    0
  );
  const blockedUnits = totalUnits - sellableCount;

  if (!product) return null;

  const handleReceive = async () => {
    const qty = Math.floor(Number(receive.qty) || 0);
    if (qty < 1) return toast.error('Received quantity must be at least 1.');
    if (!receive.expiryDate) {
      return toast.error('Enter the batch expiry date (or the product’s shelf life end).');
    }
    const days = daysUntil(receive.expiryDate);
    if (days != null && days < 0) {
      return toast.error('That expiry date has already passed.');
    }

    setReceiving(true);
    try {
      await api.batches.add(storeId, {
        productId,
        batchNo: sanitize(receive.batchNo),
        expiryDate: receive.expiryDate,
        qty,
        costPrice: Number(receive.costPrice) || 0,
        supplier: sanitize(receive.supplier),
      });
      toast.success(
        `Received ${qty} unit${qty === 1 ? '' : 's'} into batch ${sanitize(receive.batchNo) || 'OPENING'}.`
      );
      setReceive(emptyReceive);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not receive this batch.');
    } finally {
      setReceiving(false);
    }
  };

  const startEdit = (batch) => {
    setEditId(batch.id);
    setEdit({
      batchNo: batch.batchNo || '',
      expiryDate: batch.expiryDate || '',
      qty: String(batch.qty ?? ''),
      costPrice: String(batch.costPrice ?? ''),
      supplier: batch.supplier || '',
    });
  };

  const saveEdit = async () => {
    if (!editId) return;
    const qty = Math.floor(Number(edit.qty) || 0);
    if (qty < 0) return toast.error('Quantity cannot be negative.');
    setSavingEdit(true);
    try {
      await api.batches.update(editId, {
        batchNo: sanitize(edit.batchNo),
        expiryDate: edit.expiryDate || null,
        qty,
        costPrice: Number(edit.costPrice) || 0,
        supplier: sanitize(edit.supplier),
      });
      toast.success('Batch updated');
      setEditId(null);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not update this batch.');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleStatus = async (batch) => {
    const next = isActiveBatch(batch) ? 'quarantined' : 'active';
    try {
      await api.batches.update(batch.id, { status: next });
      toast.success(
        next === 'quarantined'
          ? 'Batch quarantined — it can no longer be dispensed.'
          : 'Batch restored to active stock.'
      );
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not change this batch.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.batches.remove(deleteTarget.id);
      toast.success('Batch removed');
    } catch (e) {
      toast.error(e.message || 'Could not remove this batch.');
    }
    setDeleteTarget(null);
  };

  const subtitle = [
    product.strength,
    product.dosageForm,
    product.packSize,
    product.genericName ? `(${product.genericName})` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Batches for ${product.name}`}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold truncate">{product.name}</h2>
                {product.isRx && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
                    Rx
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>
              )}
              <p className="text-xs mt-1.5">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {sellableCount} in-date
                </span>
                {blockedUnits > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {' '}
                    · {blockedUnits} expired or quarantined
                  </span>
                )}
                <span className="text-zinc-500">
                  {' '}
                  · {productBatches.length} batch{productBatches.length === 1 ? '' : 'es'}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close batches"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Receive stock: a new delivery is a new batch, never an edit of
              the existing number. */}
          <section
            className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"
            aria-label="Receive new batch"
          >
            <div className="flex items-center gap-2 mb-3">
              <PackagePlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold">Receive new batch</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  value={receive.qty}
                  onChange={(e) => setReceive({ ...receive, qty: e.target.value })}
                  aria-label="Received quantity"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Batch no.
                </label>
                <input
                  className={inputCls}
                  value={receive.batchNo}
                  onChange={(e) => setReceive({ ...receive, batchNo: e.target.value })}
                  aria-label="Batch number"
                  placeholder="e.g. B-2419"
                  maxLength={60}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Expiry *
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={receive.expiryDate}
                  onChange={(e) => setReceive({ ...receive, expiryDate: e.target.value })}
                  aria-label="Batch expiry date"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Cost / unit (₦)
                </label>
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  value={receive.costPrice}
                  onChange={(e) => setReceive({ ...receive, costPrice: e.target.value })}
                  aria-label="Batch cost per unit"
                  placeholder={String(product.costPrice ?? 0)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Supplier
                </label>
                <input
                  className={inputCls}
                  value={receive.supplier}
                  onChange={(e) => setReceive({ ...receive, supplier: e.target.value })}
                  aria-label="Batch supplier"
                  placeholder="e.g. Emzor"
                  maxLength={120}
                />
              </div>
            </div>
            <button
              onClick={handleReceive}
              disabled={receiving}
              className="mt-3 px-4 py-2 rounded-xl bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {receiving ? 'Receiving...' : 'Add batch'}
            </button>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Sales automatically take from the soonest-expiring batch first (FEFO).
            </p>
          </section>

          {/* Batch list */}
          <section aria-label="Batch list">
            <h3 className="text-sm font-bold mb-3">Batches</h3>
            {productBatches.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                No batches yet. Receive the first delivery above.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Batch no.</th>
                      <th className="px-3 py-2.5">Expiry</th>
                      <th className="px-3 py-2.5 text-right">Qty</th>
                      <th className="px-3 py-2.5 text-right">Cost/unit</th>
                      <th className="px-3 py-2.5">Supplier</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productBatches.map((batch) => {
                      const editing = editId === batch.id;
                      const bucket = expiryBucket(batch.expiryDate);
                      const expired = isActiveBatch(batch) && bucket === 'expired';
                      return (
                        <tr
                          key={batch.id}
                          className={`border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 ${
                            !isActiveBatch(batch) ? 'opacity-60' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <BatchStatusChip batch={batch} />
                          </td>
                          {editing ? (
                            <>
                              <td className="px-3 py-2">
                                <input
                                  className={inputCls}
                                  value={edit.batchNo}
                                  onChange={(e) => setEdit({ ...edit, batchNo: e.target.value })}
                                  aria-label="Edit batch number"
                                  maxLength={60}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  className={inputCls}
                                  value={edit.expiryDate}
                                  onChange={(e) => setEdit({ ...edit, expiryDate: e.target.value })}
                                  aria-label="Edit batch expiry"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  className={`${inputCls} text-right`}
                                  value={edit.qty}
                                  onChange={(e) => setEdit({ ...edit, qty: e.target.value })}
                                  aria-label="Edit batch quantity"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  className={`${inputCls} text-right`}
                                  value={edit.costPrice}
                                  onChange={(e) => setEdit({ ...edit, costPrice: e.target.value })}
                                  aria-label="Edit batch cost per unit"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className={inputCls}
                                  value={edit.supplier}
                                  onChange={(e) => setEdit({ ...edit, supplier: e.target.value })}
                                  aria-label="Edit batch supplier"
                                  maxLength={120}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={saveEdit}
                                    disabled={savingEdit}
                                    className="p-2 rounded-xl text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
                                    aria-label="Save batch changes"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditId(null)}
                                    className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    aria-label="Cancel batch changes"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2.5 font-mono text-xs">
                                {batch.batchNo || '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`text-xs flex items-center gap-1 ${
                                    expired
                                      ? 'text-red-500 font-semibold'
                                      : bucket === 'd30' || bucket === 'd60'
                                        ? 'text-amber-500'
                                        : 'text-zinc-500'
                                  }`}
                                >
                                  {expired && <AlertTriangle className="w-3 h-3" />}
                                  {batch.expiryDate ? fmtDate(batch.expiryDate) : 'No expiry'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold">
                                {batch.qty ?? 0}
                              </td>
                              <td className="px-3 py-2.5 text-right text-zinc-500">
                                {fmtMoney(batch.costPrice)}
                              </td>
                              <td className="px-3 py-2.5 text-zinc-500">
                                {batch.supplier || '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={() => startEdit(batch)}
                                    className="p-2 rounded-xl text-zinc-500 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    aria-label={`Edit batch ${batch.batchNo || ''}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => toggleStatus(batch)}
                                    className="p-2 rounded-xl text-zinc-500 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    aria-label={
                                      isActiveBatch(batch)
                                        ? `Quarantine batch ${batch.batchNo || ''}`
                                        : `Restore batch ${batch.batchNo || ''}`
                                    }
                                    title={isActiveBatch(batch) ? 'Quarantine' : 'Restore to active'}
                                  >
                                    <ShieldAlert className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget(batch)}
                                    className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    aria-label={`Delete batch ${batch.batchNo || ''}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Quarantined and recalled batches are kept for the record but never
              dispensed and never counted in sellable stock.
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Delete batch"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-2">Delete batch?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Batch {deleteTarget.batchNo || '(no number)'} with{' '}
              {deleteTarget.qty ?? 0} unit{(deleteTarget.qty ?? 0) === 1 ? '' : 's'} will
              be removed from this product's stock history.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
