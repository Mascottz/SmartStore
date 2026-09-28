// src/pages/CreditBook.jsx
// The shop's credit ledger: every partial payment and credit sale with money
// still owed, who owes it, and the full history of repayments collected
// against each debt. Cashiers record repayments here (or at the till); the
// balance on a sale is always total - amountPaid, with each repayment kept as
// its own record so the trail is never lost.
import { useMemo, useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  HandCoins,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtMoney, fmtDateTime } from '../lib/format';
import { downloadCsv } from '../lib/exportCsv';
import {
  REPAYMENT_METHODS,
  isCreditMethod,
  saleBalance,
  validateRepayment,
} from '../lib/credit';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const FILTERS = [
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'settled', label: 'Settled' },
  { value: 'all', label: 'All records' },
];

export default function CreditBook() {
  const { storeId, user, role, store } = useAuth();

  const { data: sales, loading } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );
  const { data: payments } = useStoreData(
    () => (storeId ? api.creditPayments.list(storeId) : []),
    [storeId]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('outstanding');
  const [expandedId, setExpandedId] = useState(null);
  const [payTarget, setPayTarget] = useState(null); // sale to record a repayment against
  const [deleteTarget, setDeleteTarget] = useState(null); // repayment to delete

  const debouncedSearch = useDebounce(searchTerm, 200);
  const canManage = ['owner', 'admin', 'manager'].includes(role);

  // Credit-type sales: anything sold on Partial / Credit, plus any completed
  // sale where less than the total has been paid (covers older data drift).
  const creditSales = useMemo(
    () =>
      sales.filter(
        (s) => isCreditMethod(s.paymentMethod) || saleBalance(s) > 0
      ),
    [sales]
  );

  const outstanding = useMemo(
    () => creditSales.filter((s) => s.status === 'completed' && saleBalance(s) > 0),
    [creditSales]
  );
  const outstandingTotal = outstanding.reduce((sum, s) => sum + saleBalance(s), 0);
  const debtorCount = useMemo(
    () =>
      new Set(
        outstanding.map((s) => (s.customerName || '').toLowerCase()).filter(Boolean)
      ).size,
    [outstanding]
  );

  // Money actually collected as repayments in the last 30 days.
  const collected30d = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    return payments
      .filter((p) => new Date(p.createdAt) >= since)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [payments]);

  const paymentsBySale = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      if (!map.has(p.saleId)) map.set(p.saleId, []);
      map.get(p.saleId).push(p);
    }
    return map;
  }, [payments]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return creditSales.filter((s) => {
      const balance = saleBalance(s);
      const settled = balance === 0;
      if (filter === 'outstanding' && (settled || s.status !== 'completed')) return false;
      if (filter === 'settled' && (!settled || s.status !== 'completed')) return false;
      if (!term) return true;
      return (
        (s.customerName || '').toLowerCase().includes(term) ||
        s.receiptNo.toLowerCase().includes(term)
      );
    });
  }, [creditSales, debouncedSearch, filter]);

  const handleExport = () => {
    const headers = ['Customer', 'Receipt', 'Date', 'Method', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = filtered.map((s) => [
      s.customerName || '',
      s.receiptNo,
      fmtDateTime(s.createdAt),
      s.paymentMethod,
      s.total,
      s.amountPaid ?? s.total,
      saleBalance(s),
      s.status === 'voided'
        ? 'voided'
        : saleBalance(s) === 0
          ? 'settled'
          : 'outstanding',
    ]);
    downloadCsv(`${store?.name || 'credit-book'}-export`, headers, rows);
    toast.success('Exported to CSV');
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold">Credit Book</h1>
            <HelpTip
              label="Help: Credit Book"
              iconClassName="w-7 h-7"
              text="Every sale where the customer still owes money: partial payments and full credit. Open a record to see every repayment collected, or tap Record payment when the customer comes back to settle. Records stay here even after a debt is fully paid."
            />
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {outstanding.length} open debt{outstanding.length !== 1 ? 's' : ''} &middot;{' '}
            {fmtMoney(outstandingTotal)} outstanding
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:border-emerald-500 transition-all"
            aria-label="Export credit records to CSV"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Kpi
          label="Total outstanding"
          value={fmtMoney(outstandingTotal)}
          accent="text-amber-600 dark:text-amber-400"
          help="The money customers still owe across all open credit and part-payment sales, not counting voided receipts."
        />
        <Kpi
          label="People owing"
          value={debtorCount}
          accent="text-sky-500"
          help="How many different customers currently have an unpaid balance. The same customer with two unpaid receipts counts once."
        />
        <Kpi
          label="Collected, last 30 days"
          value={fmtMoney(collected30d)}
          accent="text-emerald-500"
          help="Repayments recorded against old debts in the last 30 days, money that came in after the original sales."
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer name or receipt number..."
            aria-label="Search credit records"
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter credit records"
            className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <HelpTip
            label="Help: Credit record filter"
            text="Outstanding shows only debts the customer still needs to pay. Settled shows credit sales that have been fully paid off. All records also includes credit sales that were later voided, struck through."
          />
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 h-24"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-sm text-zinc-500">
              {debouncedSearch
                ? `No credit records match "${debouncedSearch}".`
                : filter === 'outstanding'
                  ? 'Nobody owes the shop right now. Sales made with the Partial or Credit payment method appear here.'
                  : 'No credit records found.'}
            </p>
          </div>
        ) : (
          filtered.map((sale) => {
            const balance = saleBalance(sale);
            const paid = Number(sale.amountPaid ?? sale.total) || 0;
            const settled = balance === 0;
            const voided = sale.status === 'voided';
            const expanded = expandedId === sale.id;
            const ledger = paymentsBySale.get(sale.id) || [];
            const paidPct = sale.total > 0 ? Math.min(100, Math.round((paid / sale.total) * 100)) : 100;

            return (
              <div
                key={sale.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : sale.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                  aria-expanded={expanded}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">
                        {sale.customerName || 'Unknown customer'}
                      </p>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                          voided
                            ? 'bg-red-500/10 text-red-500'
                            : settled
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {voided ? 'Voided' : settled ? 'Settled' : 'Owing'}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {sale.paymentMethod}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {sale.receiptNo} &middot; {fmtDateTime(sale.createdAt)}
                      {sale.cashierEmail && <> &middot; {sale.cashierEmail}</>}
                    </p>
                    {/* repayment progress */}
                    <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${voided ? 'bg-zinc-400' : 'bg-emerald-500'}`}
                        style={{ width: `${paidPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs text-zinc-500 ${voided ? 'line-through' : ''}`}
                    >
                      paid {fmtMoney(paid)} of {fmtMoney(sale.total)}
                    </p>
                    <p
                      className={`font-bold ${
                        voided || settled
                          ? 'text-zinc-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {settled && !voided ? fmtMoney(sale.total) : fmtMoney(balance)}
                    </p>
                  </div>
                  {expanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                </button>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">
                    {/* line items */}
                    <table className="w-full text-sm mt-3">
                      <tbody>
                        {sale.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-1">{item.name}</td>
                            <td className="py-1 text-center text-zinc-500">&times;{item.qty}</td>
                            <td className="py-1 text-right">{fmtMoney(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* repayment ledger */}
                    <div className="mt-3 flex items-center gap-1.5">
                      <h4 className="text-xs font-semibold uppercase text-zinc-500">
                        Repayments ({ledger.length})
                      </h4>
                      <HelpTip
                        label="Help: Repayment history"
                        text="Every amount this customer has paid towards the debt, who collected it and how. Deleting a record (manager and above) puts its amount back onto the outstanding balance."
                      />
                    </div>
                    {ledger.length === 0 ? (
                      <p className="text-xs text-zinc-500 mt-1.5">
                        No repayments yet.
                      </p>
                    ) : (
                      <div className="mt-1.5 space-y-1.5">
                        {ledger.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3 py-2"
                          >
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              +{fmtMoney(p.amount)}
                            </span>
                            <span className="text-zinc-500">
                              {p.method} &middot; {fmtDateTime(p.createdAt)}
                              {p.receivedBy && <> &middot; {p.receivedBy}</>}
                              {p.note && <> &middot; {p.note}</>}
                            </span>
                            {canManage && (
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="ml-auto p-1 text-zinc-400 hover:text-red-500"
                                aria-label={`Delete repayment of ${fmtMoney(p.amount)}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {!voided && !settled && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setPayTarget(sale)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 text-black text-xs font-semibold hover:bg-emerald-400"
                        >
                          <HandCoins className="w-3.5 h-3.5" /> Record payment
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Record payment modal */}
      {payTarget && (
        <RepaymentModal
          sale={payTarget}
          cashierEmail={user?.email || ''}
          onClose={() => setPayTarget(null)}
        />
      )}

      {/* Delete repayment confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete repayment record?"
        message={
          deleteTarget
            ? `The ${fmtMoney(deleteTarget.amount)} repayment from ${deleteTarget.customerName || 'this customer'} will be removed and its amount added back to the outstanding balance.`
            : ''
        }
        confirmLabel="Delete record"
        variant="danger"
        onConfirm={async () => {
          try {
            await api.creditPayments.remove(deleteTarget.id);
            toast.success('Repayment record deleted.');
          } catch (err) {
            toast.error(err.message || 'Could not delete the record.');
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/** Modal that collects one repayment against an open debt. */
function RepaymentModal({ sale, cashierEmail, onClose }) {
  const balance = saleBalance(sale);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    let value;
    try {
      value = validateRepayment({ amount, balance });
    } catch (err) {
      return toast.error(err.message);
    }
    setSaving(true);
    try {
      await api.creditPayments.add(sale.storeId, {
        saleId: sale.id,
        amount: value,
        method,
        note,
        receivedBy: cashierEmail,
      });
      const remaining = balance - value;
      toast.success(
        remaining === 0
          ? `${sale.customerName || 'Customer'} has settled ${sale.receiptNo} in full.`
          : `Payment recorded; ${fmtMoney(remaining)} still owed on ${sale.receiptNo}.`
      );
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not record the payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Record payment"
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg">Record payment</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          {sale.customerName || 'Customer'} owes{' '}
          <strong className="text-amber-600 dark:text-amber-400">{fmtMoney(balance)}</strong>{' '}
          on {sale.receiptNo}.
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="repay-amount"
              className="block text-xs font-medium text-zinc-500 mb-1.5"
            >
              Amount received (₦) *
            </label>
            <input
              id="repay-amount"
              type="number"
              min="0"
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm"
            />
            {Number(amount) > 0 && Number(amount) < balance && (
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Part payment; {fmtMoney(balance - (Number(amount) || 0))} will remain.
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="repay-method"
              className="block text-xs font-medium text-zinc-500 mb-1.5"
            >
              Paid via
            </label>
            <select
              id="repay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm"
            >
              {REPAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="repay-note"
              className="block text-xs font-medium text-zinc-500 mb-1.5"
            >
              Note (optional)
            </label>
            <input
              id="repay-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Promised to bring the rest on Friday"
              maxLength={500}
              className="w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Record Payment'}
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, help }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
      <p className={`text-xl font-bold truncate ${accent}`}>{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
        {label}
        {help && <HelpTip className="ml-1" label={`Help: ${label}`} text={help} />}
      </p>
    </div>
  );
}
