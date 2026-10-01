// src/pages/Purchases.jsx
// Pharmacy Mode Phase 2: recording deliveries. A purchase captures the
// supplier, their paperwork reference and every line received - and each line
// becomes a real batch (number, expiry, cost, supplier) in one transaction,
// so stock never again "arrives" by editing a number.
import { useMemo, useState } from 'react';
import { X, Trash2, PackagePlus, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

const compactInputCls =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900';

const emptyLine = () => ({
  productId: '',
  qty: '',
  batchNo: '',
  expiryDate: '',
  unitCost: '',
});

export default function Purchases() {
  const { storeId, user } = useAuth();

  const { data: purchases, loading } = useStoreData(
    () => (storeId ? api.purchases.list(storeId) : []),
    [storeId]
  );
  const { data: suppliers } = useStoreData(
    () => (storeId ? api.suppliers.list(storeId) : []),
    [storeId]
  );
  const { data: products } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );

  const [showNew, setShowNew] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const productById = useMemo(
    () => new Map((products || []).map((p) => [p.id, p])),
    [products]
  );
  const supplierById = useMemo(
    () => new Map((suppliers || []).map((s) => [s.id, s])),
    [suppliers]
  );

  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return (purchases || [])
      .filter((p) => {
        const d = new Date(p.createdAt);
        return (
          d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  }, [purchases]);

  const openNew = () => {
    setSupplierId('');
    setReference('');
    setLines([emptyLine()]);
    setShowNew(true);
  };

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        // Cost defaults to the product's recorded cost until overridden.
        if (patch.productId && next.unitCost === '') {
          next.unitCost = String(productById.get(patch.productId)?.costPrice ?? '');
        }
        return next;
      })
    );
  };

  const draftTotal = lines.reduce((sum, line) => {
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const cost = Math.max(0, Number(line.unitCost) || 0);
    return sum + qty * cost;
  }, 0);

  const handleSave = async () => {
    const cleanLines = lines
      .map((line) => ({
        productId: line.productId,
        name: productById.get(line.productId)?.name || '',
        qty: Math.max(0, Math.floor(Number(line.qty) || 0)),
        batchNo: line.batchNo,
        expiryDate: line.expiryDate,
        unitCost: Math.max(0, Number(line.unitCost) || 0),
        supplier: supplierById.get(supplierId)?.name || '',
      }))
      .filter((line) => line.productId && line.qty > 0);
    if (cleanLines.length === 0) {
      return toast.error('Add at least one medicine with a quantity.');
    }
    const missingExpiry = cleanLines.find((line) => !line.expiryDate);
    if (missingExpiry) {
      return toast.error('Every line needs the batch expiry date.');
    }

    setSaving(true);
    try {
      await api.purchases.create(storeId, {
        supplierId: supplierId || null,
        reference,
        items: cleanLines,
        receivedBy: user?.email || '',
      });
      toast.success(
        `Delivery recorded - ${cleanLines.length} batch${cleanLines.length === 1 ? '' : 'es'} received into stock.`
      );
      setShowNew(false);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not record this delivery.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.purchases.remove(deleteTarget.id);
      toast.success('Purchase record removed');
    } catch (e) {
      toast.error(e.message || 'Could not delete.');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            Purchases
            <HelpTip
              label="Help: Purchases"
              text="Every recorded delivery: supplier, their invoice or waybill reference, and the batches it brought in. Recording a delivery is how pharmacy stock arrives - each line becomes a batch with its own number, expiry and cost."
            />
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {(purchases || []).length} recorded
            {totalThisMonth > 0 && (
              <span> · {fmtMoney(totalThisMonth)} received this month</span>
            )}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
        >
          <PackagePlus className="w-4 h-4" /> Record delivery
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3 text-right">Lines</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : (purchases || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-500">
                    No deliveries recorded yet. Record one the next time stock arrives!
                  </td>
                </tr>
              ) : (
                (purchases || []).map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3 text-zinc-500 text-xs">
                      {fmtDate(p.createdAt)}
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {p.supplierId
                        ? supplierById.get(p.supplierId)?.name || '-'
                        : p.items?.[0]?.supplier || '-'}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-zinc-500">
                      {p.reference || '-'}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-500">
                      {(p.items || []).length}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {fmtMoney(p.total)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setViewTarget(p)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`View delivery ${p.reference || ''}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`Delete delivery ${p.reference || ''}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record delivery modal */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setShowNew(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Record delivery"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Record delivery</h2>
              <button
                onClick={() => setShowNew(false)}
                disabled={saving}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Supplier
                </label>
                <select
                  className={inputCls}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  aria-label="Delivery supplier"
                >
                  <option value="">Not recorded / walk-in</option>
                  {(suppliers || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Invoice / waybill no.
                </label>
                <input
                  className={inputCls}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="From the supplier's paperwork"
                  aria-label="Delivery reference"
                  maxLength={60}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Lines received
                </p>
                <button
                  type="button"
                  onClick={() => setLines((current) => [...current, emptyLine()])}
                  className="text-xs font-semibold text-emerald-500 hover:underline"
                >
                  + Add line
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-2 md:grid-cols-5 gap-2 items-center"
                  >
                    <select
                      className={`${compactInputCls} md:col-span-2`}
                      value={line.productId}
                      onChange={(e) => updateLine(index, { productId: e.target.value })}
                      aria-label={`Line ${index + 1} medicine`}
                    >
                      <option value="">Select medicine...</option>
                      {(products || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      className={compactInputCls}
                      value={line.qty}
                      onChange={(e) => updateLine(index, { qty: e.target.value })}
                      aria-label={`Line ${index + 1} quantity`}
                      placeholder="Qty"
                    />
                    <input
                      className={compactInputCls}
                      value={line.batchNo}
                      onChange={(e) => updateLine(index, { batchNo: e.target.value })}
                      aria-label={`Line ${index + 1} batch number`}
                      placeholder="Batch no."
                      maxLength={60}
                    />
                    <input
                      type="date"
                      className={compactInputCls}
                      value={line.expiryDate}
                      onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                      aria-label={`Line ${index + 1} expiry`}
                    />
                    <input
                      type="number"
                      min="0"
                      className={`${compactInputCls} md:col-span-2`}
                      value={line.unitCost}
                      onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                      aria-label={`Line ${index + 1} unit cost`}
                      placeholder="Cost / unit (₦)"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.length > 1
                            ? current.filter((_, i) => i !== index)
                            : current
                        )
                      }
                      className="p-2 rounded-xl text-zinc-400 hover:text-red-500 justify-self-end"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 mt-4 pt-4">
              <span className="text-sm text-zinc-500">Delivery total (at cost)</span>
              <span className="text-2xl font-bold">{fmtMoney(draftTotal)}</span>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-4 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Recording...' : 'Receive into stock'}
            </button>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setViewTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Delivery detail"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                Delivery {viewTarget.reference ? `· ${viewTarget.reference}` : ''}
              </h2>
              <button
                onClick={() => setViewTarget(null)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-500 mb-4">
              {fmtDate(viewTarget.createdAt)}
              {viewTarget.supplierId
                ? ` · ${supplierById.get(viewTarget.supplierId)?.name || ''}`
                : ''}
              {viewTarget.receivedBy ? ` · received by ${viewTarget.receivedBy}` : ''}
            </p>

            <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2.5">Medicine</th>
                    <th className="px-3 py-2.5">Batch</th>
                    <th className="px-3 py-2.5">Expiry</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewTarget.items || []).map((item, i) => (
                    <tr
                      key={item.batchId || i}
                      className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0"
                    >
                      <td className="px-3 py-2.5">{item.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {item.batchNo || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-500">
                        {item.expiryDate ? fmtDate(item.expiryDate) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">{item.qty}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-500">
                        {fmtMoney(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-right font-bold mt-3">
              Total {fmtMoney(viewTarget.total)}
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete purchase record?"
        message={
          deleteTarget
            ? 'Only the ledger row is removed. The batches this delivery created stay in stock: adjust or remove them from the batch drawer if the delivery itself was a mistake.'
            : ''
        }
        confirmLabel="Delete record"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
