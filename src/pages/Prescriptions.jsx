// src/pages/Prescriptions.jsx
// Pharmacy Mode Phase 2: structured prescriptions with part-dispensing.
//
// A prescription records what was prescribed (patient, prescriber, medicines
// and quantities) and what has been dispensed against it. Dispensing runs
// through the normal sale engine, so FEFO allocation, receipts, batch
// traceability and voids all behave exactly like a till sale — the script
// simply advances its line quantities and keeps the audit trail.
//
// Deliberate scope: operational record-keeping only. No clinical notes, no
// diagnoses, no dosage instructions — what and how much, never why.
import { useMemo, useState } from 'react';
import {
  Plus,
  X,
  Search,
  Trash2,
  ClipboardList,
  Eye,
  Ban,
  Pill,
  MessageCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';
import { sanitize } from '../lib/validate';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

const PAYMENT_METHODS = ['Cash', 'Transfer', 'POS/Card'];

// Nigerian numbers to wa.me form: '0802-311-4455' → '2348023114455'.
// Returns '' when the digits don't look like a phone number at all.
const waLinkNumber = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
  if (digits.length >= 10) return digits;
  return '';
};

const emptyRxForm = {
  patientName: '',
  patientPhone: '',
  patientAge: '',
  prescriber: '',
  notes: '',
};

const statusChip = (status) => {
  if (status === 'dispensed') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (status === 'cancelled') return 'bg-zinc-500/10 text-zinc-500';
  return 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
};

export default function Prescriptions() {
  const { storeId, user } = useAuth();

  const { data: prescriptions, loading } = useStoreData(
    () => (storeId ? api.prescriptions.list(storeId) : []),
    [storeId]
  );
  const { data: products } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );
  const { data: dispensings } = useStoreData(
    () => (storeId ? api.prescriptions.dispensings.list(storeId) : []),
    [storeId]
  );
  // Phase 3: flagged pharmacists, offered as the verifier when dispensing
  // controlled medicines against a script.
  const { data: team } = useStoreData(
    () => (storeId ? api.team.list(storeId) : []),
    [storeId]
  );
  const pharmacists = useMemo(
    () => (team || []).filter((m) => m.isPharmacist),
    [team]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);

  const [showNew, setShowNew] = useState(false);
  const [rxForm, setRxForm] = useState(emptyRxForm);
  const [rxLines, setRxLines] = useState([{ productId: '', qty: '' }]);
  const [saving, setSaving] = useState(false);

  const [dispenseTarget, setDispenseTarget] = useState(null);
  const [dispenseQty, setDispenseQty] = useState({});
  const [dispenseMethod, setDispenseMethod] = useState('Cash');
  const [dispenseVerifier, setDispenseVerifier] = useState('');
  const [dispensing, setDispensing] = useState(false);

  const [viewTarget, setViewTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [deleteTargetRx, setDeleteTargetRx] = useState(null);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase().trim();
    const list = prescriptions || [];
    if (!term) return list;
    return list.filter(
      (r) =>
        (r.code || '').toLowerCase().includes(term) ||
        (r.patientName || '').toLowerCase().includes(term) ||
        (r.prescriber || '').toLowerCase().includes(term)
    );
  }, [prescriptions, debouncedSearch]);

  const openCount = (prescriptions || []).filter((r) => r.status === 'open').length;
  // Refill nudges: open scripts with a phone number the pharmacy can call
  // or message about the balance still owed.
  const dueForReminder = (prescriptions || []).filter(
    (r) => r.status === 'open' && waLinkNumber(r.patientPhone)
  );

  const messagePatient = (rx) => {
    const number = waLinkNumber(rx.patientPhone);
    if (!number) return toast.error('No usable phone number on this prescription.');
    const remaining = rx.items
      .filter((i) => i.prescribedQty - i.dispensedQty > 0)
      .map((i) => `${i.productName} (${i.prescribedQty - i.dispensedQty})`)
      .join(', ');
    const text = `Hello ${rx.patientName}, this is a reminder from your pharmacy about the balance of your prescription: ${remaining}. Kindly come in at your convenience to collect it.`;
    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener'
    );
  };
  const productById = useMemo(
    () => new Map((products || []).map((p) => [p.id, p])),
    [products]
  );

  const dispensingsByRx = useMemo(() => {
    const map = new Map();
    (dispensings || []).forEach((d) => {
      const list = map.get(d.prescriptionId) || [];
      list.push(d);
      map.set(d.prescriptionId, list);
    });
    return map;
  }, [dispensings]);

  // ---------------------------------------------------------------- create

  const openNew = () => {
    setRxForm(emptyRxForm);
    setRxLines([{ productId: '', qty: '' }]);
    setShowNew(true);
  };

  const updateRxLine = (index, patch) => {
    setRxLines((lines) =>
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  };

  const handleCreate = async () => {
    const lines = rxLines
      .map((line) => ({
        productId: line.productId,
        name: productById.get(line.productId)?.name || '',
        qty: Math.max(0, Math.floor(Number(line.qty) || 0)),
      }))
      .filter((line) => line.productId && line.qty > 0);
    if (!sanitize(rxForm.patientName)) {
      return toast.error('Patient name is required.');
    }
    if (lines.length === 0) {
      return toast.error('Add at least one medicine with a quantity.');
    }

    setSaving(true);
    try {
      const created = await api.prescriptions.create(storeId, {
        ...rxForm,
        items: lines,
        createdBy: user?.email || '',
      });
      toast.success(`Prescription ${created.code} recorded`);
      setShowNew(false);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not save this prescription.');
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------------------- dispense

  const openDispense = (rx) => {
    const defaults = {};
    rx.items.forEach((item) => {
      defaults[item.productId] = String(
        Math.max(0, item.prescribedQty - item.dispensedQty)
      );
    });
    setDispenseQty(defaults);
    setDispenseMethod('Cash');
    setDispenseVerifier(
      (user?.email && pharmacists.find((m) => m.email === user.email)?.email) ||
        pharmacists[0]?.email ||
        ''
    );
    setDispenseTarget(rx);
  };

  const dispensePreview = useMemo(() => {
    if (!dispenseTarget) return 0;
    return dispenseTarget.items.reduce((sum, item) => {
      const qty = Math.max(0, Math.floor(Number(dispenseQty[item.productId]) || 0));
      return sum + qty * (productById.get(item.productId)?.salePrice || 0);
    }, 0);
  }, [dispenseTarget, dispenseQty, productById]);

  const handleDispense = async () => {
    if (!dispenseTarget) return;
    const lines = dispenseTarget.items
      .map((item) => ({
        productId: item.productId,
        qty: Math.max(0, Math.floor(Number(dispenseQty[item.productId]) || 0)),
      }))
      .filter((line) => line.qty > 0);
    if (lines.length === 0) {
      return toast.error('Select at least one medicine to dispense.');
    }

    setDispensing(true);
    try {
      // Controlled lines name the verifying pharmacist for the register.
      const hasControlled = lines.some(
        (line) => productById.get(line.productId)?.isControlled
      );
      const { sale, prescription } = await api.prescriptions.dispense(storeId, {
        prescriptionId: dispenseTarget.id,
        lines,
        paymentMethod: dispenseMethod,
        cashierEmail: user?.email || '',
        verifiedBy: hasControlled ? dispenseVerifier || '' : '',
      });
      toast.success(
        prescription.status === 'dispensed'
          ? `Dispensed ${sale.receiptNo} — prescription ${dispenseTarget.code} complete.`
          : `Dispensed ${sale.receiptNo} — ${dispenseTarget.code} stays open for the balance.`
      );
      setDispenseTarget(null);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not dispense.');
    } finally {
      setDispensing(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.prescriptions.cancel(cancelTarget.id);
      toast.success(`Prescription ${cancelTarget.code} cancelled`);
    } catch (e) {
      toast.error(e.message || 'Could not cancel.');
    }
    setCancelTarget(null);
  };

  // ------------------------------------------------------------------ render

  const progressOf = (rx) => {
    const prescribed = rx.items.reduce((s, i) => s + i.prescribedQty, 0);
    const dispensed = rx.items.reduce((s, i) => s + i.dispensedQty, 0);
    return { prescribed, dispensed };
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            Prescriptions
            <HelpTip
              label="Help: Prescriptions"
              text="Record what was prescribed and dispense against it, fully or in part. Every dispensing becomes a normal sale with FEFO batch allocation and a receipt, and the prescription keeps the running balance until it is complete."
            />
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {(prescriptions || []).length} recorded
            {openCount > 0 && (
              <span className="text-sky-500"> · {openCount} open</span>
            )}
            {dueForReminder.length > 0 && (
              <span className="text-emerald-500">
                {' '}
                · {dueForReminder.length} patient{dueForReminder.length === 1 ? '' : 's'} to
                remind about refills
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
        >
          <Plus className="w-4 h-4" /> New prescription
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by code, patient or prescriber..."
            aria-label="Search prescriptions"
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Patient</th>
                <th className="px-5 py-3">Prescriber</th>
                <th className="px-5 py-3">Progress</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">
                    {debouncedSearch
                      ? `No prescriptions match "${debouncedSearch}".`
                      : 'No prescriptions yet. Record the first one!'}
                  </td>
                </tr>
              ) : (
                filtered.map((rx) => {
                  const { prescribed, dispensed } = progressOf(rx);
                  const done = rx.status === 'dispensed';
                  const cancelled = rx.status === 'cancelled';
                  return (
                    <tr
                      key={rx.id}
                      className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-5 py-3 font-mono text-xs font-semibold">
                        {rx.code}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{rx.patientName}</p>
                        {rx.patientPhone && (
                          <p className="text-[11px] text-zinc-500">{rx.patientPhone}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-500">
                        {rx.prescriber || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            done
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          {dispensed} / {prescribed} units
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusChip(rx.status)}`}
                        >
                          {rx.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-500 text-xs">
                        {fmtDate(rx.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          {rx.status === 'open' && waLinkNumber(rx.patientPhone) && (
                            <button
                              onClick={() => messagePatient(rx)}
                              className="p-2 rounded-xl text-zinc-500 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              aria-label={`Message ${rx.patientName} about the balance`}
                              title="Message patient about the balance (WhatsApp)"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openDispense(rx)}
                            disabled={done || cancelled}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                            aria-label={`Dispense ${rx.code}`}
                          >
                            Dispense
                          </button>
                          <button
                            onClick={() => setViewTarget(rx)}
                            className="p-2 rounded-xl text-zinc-500 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            aria-label={`View ${rx.code}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setCancelTarget(rx)}
                            disabled={done || cancelled}
                            className="p-2 rounded-xl text-zinc-500 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
                            aria-label={`Cancel ${rx.code}`}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTargetRx(rx)}
                            disabled={done}
                            className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
                            aria-label={`Delete ${rx.code}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New prescription modal */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowNew(false)}
          role="dialog"
          aria-modal="true"
          aria-label="New prescription"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-500" /> New prescription
              </h2>
              <button
                onClick={() => setShowNew(false)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Patient name *
                  </label>
                  <input
                    className={inputCls}
                    value={rxForm.patientName}
                    onChange={(e) => setRxForm({ ...rxForm, patientName: e.target.value })}
                    placeholder="e.g. Mrs. Adeyemi"
                    aria-label="Patient name"
                    maxLength={120}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Phone
                  </label>
                  <input
                    className={inputCls}
                    value={rxForm.patientPhone}
                    onChange={(e) => setRxForm({ ...rxForm, patientPhone: e.target.value })}
                    placeholder="Optional, for pickup reminders"
                    aria-label="Patient phone"
                    maxLength={40}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Age
                  </label>
                  <input
                    className={inputCls}
                    value={rxForm.patientAge}
                    onChange={(e) => setRxForm({ ...rxForm, patientAge: e.target.value })}
                    placeholder="e.g. 34"
                    aria-label="Patient age"
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    Prescriber
                  </label>
                  <input
                    className={inputCls}
                    value={rxForm.prescriber}
                    onChange={(e) => setRxForm({ ...rxForm, prescriber: e.target.value })}
                    placeholder="Doctor or facility"
                    aria-label="Prescriber"
                    maxLength={120}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Notes
                </label>
                <input
                  className={inputCls}
                  value={rxForm.notes}
                  onChange={(e) => setRxForm({ ...rxForm, notes: e.target.value })}
                  placeholder="Optional pickup notes"
                  aria-label="Prescription notes"
                  maxLength={500}
                />
              </div>

              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                    Prescribed medicines
                  </p>
                  <button
                    type="button"
                    onClick={() => setRxLines((lines) => [...lines, { productId: '', qty: '' }])}
                    className="text-xs font-semibold text-emerald-500 hover:underline"
                  >
                    + Add medicine
                  </button>
                </div>
                <div className="space-y-2">
                  {rxLines.map((line, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        className={inputCls}
                        value={line.productId}
                        onChange={(e) => updateRxLine(index, { productId: e.target.value })}
                        aria-label={`Prescribed medicine ${index + 1}`}
                      >
                        <option value="">Select medicine...</option>
                        {(products || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.isRx ? ' (Rx)' : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        className={`${inputCls} w-24 text-right`}
                        value={line.qty}
                        onChange={(e) => updateRxLine(index, { qty: e.target.value })}
                        aria-label={`Quantity ${index + 1}`}
                        placeholder="Qty"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRxLines((lines) =>
                            lines.length > 1
                              ? lines.filter((_, i) => i !== index)
                              : lines
                          )
                        }
                        className="p-2 rounded-xl text-zinc-400 hover:text-red-500"
                        aria-label={`Remove line ${index + 1}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full mt-6 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Record prescription'}
            </button>
          </div>
        </div>
      )}

      {/* Dispense modal */}
      {dispenseTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !dispensing && setDispenseTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Dispense ${dispenseTarget.code}`}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">Dispense {dispenseTarget.code}</h2>
              <button
                onClick={() => setDispenseTarget(null)}
                disabled={dispensing}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-500 mb-4">
              {dispenseTarget.patientName}
              {dispenseTarget.prescriber ? ` · ${dispenseTarget.prescriber}` : ''}
            </p>

            <div className="space-y-2 mb-4">
              {dispenseTarget.items.map((item) => {
                const remaining = item.prescribedQty - item.dispensedQty;
                const product = productById.get(item.productId);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{item.productName}</span>
                        {product?.isRx && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 shrink-0">
                            Rx
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {item.dispensedQty} of {item.prescribedQty} already dispensed
                        {remaining > 0 ? ` · ${remaining} remaining` : ''}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={dispenseQty[item.productId] ?? ''}
                      onChange={(e) =>
                        setDispenseQty((q) => ({
                          ...q,
                          [item.productId]: e.target.value,
                        }))
                      }
                      className={`${inputCls} w-24 text-right`}
                      aria-label={`Dispense quantity for ${item.productName}`}
                      disabled={remaining <= 0}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                Payment
              </label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={dispenseMethod === m}
                    onClick={() => setDispenseMethod(m)}
                    className={`px-2 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      dispenseMethod === m
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Dispensing settles at pickup. For part-payment or credit, ring the
                sale at the POS instead.
              </p>
            </div>

            {dispenseTarget.items.some((item) => {
              const qty = Math.max(
                0,
                Math.floor(Number(dispenseQty[item.productId]) || 0)
              );
              return qty > 0 && productById.get(item.productId)?.isControlled;
            }) && (
              <div className="mb-4">
                <label
                  htmlFor="dispense-verifier"
                  className="block text-xs font-medium text-zinc-500 mb-1.5"
                >
                  Verifying pharmacist (controlled medicine in this dispensing)
                </label>
                {pharmacists.length > 0 ? (
                  <select
                    id="dispense-verifier"
                    value={dispenseVerifier}
                    onChange={(e) => setDispenseVerifier(e.target.value)}
                    className={inputCls}
                  >
                    {pharmacists.map((m) => (
                      <option key={m.id} value={m.email}>
                        {m.email}
                        {m.email === user?.email ? ' (you)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
                    No pharmacist is flagged on your team yet — this dispensing
                    will be recorded without a named verifier. Flag licensed
                    pharmacists in Team.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
              <span className="text-sm text-zinc-500">Total</span>
              <span className="text-2xl font-bold">{fmtMoney(dispensePreview)}</span>
            </div>

            <button
              onClick={handleDispense}
              disabled={dispensing}
              className="w-full mt-4 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 disabled:opacity-50"
            >
              {dispensing ? 'Dispensing...' : 'Dispense & complete sale'}
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
          aria-label={`Prescription ${viewTarget.code}`}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{viewTarget.code}</h2>
              <button
                onClick={() => setViewTarget(null)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <p>
                <span className="text-zinc-500">Patient:</span>{' '}
                <span className="font-medium">{viewTarget.patientName}</span>
              </p>
              <p>
                <span className="text-zinc-500">Prescriber:</span>{' '}
                <span className="font-medium">{viewTarget.prescriber || '—'}</span>
              </p>
              {viewTarget.patientPhone && (
                <p>
                  <span className="text-zinc-500">Phone:</span> {viewTarget.patientPhone}
                </p>
              )}
              {viewTarget.patientAge && (
                <p>
                  <span className="text-zinc-500">Age:</span> {viewTarget.patientAge}
                </p>
              )}
              <p>
                <span className="text-zinc-500">Recorded:</span> {fmtDate(viewTarget.createdAt)}
              </p>
              <p>
                <span className="text-zinc-500">Status:</span>{' '}
                <span className="font-medium capitalize">{viewTarget.status}</span>
              </p>
            </div>
            {viewTarget.notes && (
              <p className="text-sm text-zinc-500 mb-4">{viewTarget.notes}</p>
            )}

            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">
              Medicines
            </p>
            <div className="space-y-1.5 mb-4">
              {viewTarget.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Pill className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="truncate">{item.productName}</span>
                  </span>
                  <span className="text-zinc-500 text-xs shrink-0 ml-2">
                    {item.dispensedQty} / {item.prescribedQty}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">
              Dispensing history
            </p>
            {(dispensingsByRx.get(viewTarget.id) || []).length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing dispensed yet.</p>
            ) : (
              <div className="space-y-1.5">
                {(dispensingsByRx.get(viewTarget.id) || []).map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs"
                  >
                    <p className="font-semibold">
                      {fmtDate(d.createdAt)} · {d.receiptNo}
                      {d.items.some((i) => Array.isArray(i.batches) && i.batches.length)
                        ? ' · batches traced'
                        : ''}
                    </p>
                    <p className="text-zinc-500">
                      {d.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel / delete confirmations */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={`Cancel ${cancelTarget?.code}?`}
        message={
          cancelTarget
            ? `${cancelTarget.patientName}'s prescription will be marked cancelled. Already dispensed items and receipts stay on record.`
            : ''
        }
        confirmLabel="Cancel prescription"
        variant="warning"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTargetRx)}
        title={`Delete ${deleteTargetRx?.code}?`}
        message={
          deleteTargetRx
            ? `The prescription record and its dispensing history will be removed. Completed sales and receipts are not affected.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          if (!deleteTargetRx) return;
          try {
            await api.prescriptions.remove(deleteTargetRx.id);
            toast.success('Prescription deleted');
          } catch (e) {
            toast.error(e.message || 'Could not delete.');
          }
          setDeleteTargetRx(null);
        }}
        onCancel={() => setDeleteTargetRx(null)}
      />
    </div>
  );
}
