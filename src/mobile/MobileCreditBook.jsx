// src/mobile/MobileCreditBook.jsx
// Who owes the shop, on a phone: the outstanding total up top, one card per
// debt with a settlement progress bar, tap to expand the items and the full
// repayment ledger, and a bottom sheet to record a payment when a customer
// comes back. Mirrors the main Credit Book.
import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  HandCoins,
  Search,
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
  { value: 'all', label: 'All' },
];

export default function MobileCreditBook() {
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
  const [payTarget, setPayTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 200);
  const canManage = ['owner', 'admin', 'manager'].includes(role);

  const creditSales = useMemo(
    () => sales.filter((s) => isCreditMethod(s.paymentMethod) || saleBalance(s) > 0),
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
      s.status === 'voided' ? 'voided' : saleBalance(s) === 0 ? 'settled' : 'outstanding',
    ]);
    downloadCsv(`${store?.name || 'credit-book'}-export`, headers, rows);
    toast.success('Exported to CSV');
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Credit Book
            <HelpTip
              label="Help: Credit Book (monitoring)"
              text="Every sale where the customer still owes money: partial payments and full credit. Tap a record for its items and repayment history, or record a payment when the customer comes back."
            />
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {outstanding.length} open debt{outstanding.length !== 1 ? 's' : ''} ·{' '}
            {fmtMoney(outstandingTotal)} outstanding
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExport}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:border-emerald-500"
            aria-label="Export credit records to CSV"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <Kpi label="Owed to you" value={fmtMoney(outstandingTotal)} accent="text-amber-600 dark:text-amber-400" />
        <Kpi label="People owing" value={debtorCount} accent="text-sky-500" />
        <Kpi label="Collected 30d" value={fmtMoney(collected30d)} accent="text-emerald-500" />
      </div>

      {/* Search + chips */}
      <div className="sticky top-[61px] z-20 -mx-4 px-4 py-2 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Customer or receipt…"
            aria-label="Search credit records"
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <div className="flex gap-1.5 mt-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                filter === f.value
                  ? 'bg-emerald-500 text-black'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Debt cards */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl h-24"
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-sm text-zinc-500">
              {debouncedSearch
                ? `No credit records match "${debouncedSearch}".`
                : filter === 'outstanding'
                  ? 'Nobody owes the shop right now. Partial and Credit sales appear here.'
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
            const paidPct =
              sale.total > 0 ? Math.min(100, Math.round((paid / sale.total) * 100)) : 100;

            return (
              <div
                key={sale.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : sale.id)}
                  aria-expanded={expanded}
                  className="w-full p-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm ${voided ? 'line-through text-zinc-400' : ''}`}>
                        {sale.customerName || 'Customer'}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {sale.receiptNo} · {fmtDateTime(sale.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold ${
                          voided
                            ? 'text-zinc-400 line-through'
                            : settled
                              ? 'text-emerald-500'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {voided ? fmtMoney(sale.total) : settled ? 'Settled' : fmtMoney(balance)}
                      </p>
                      {!voided && !settled && (
                        <p className="text-[10px] text-zinc-500">still owed</p>
                      )}
                    </div>
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}
                  </div>

                  {/* settlement progress */}
                  {!voided && (
                    <div className="mt-2.5">
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${settled ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {fmtMoney(paid)} paid of {fmtMoney(sale.total)} ({paidPct}%)
                      </p>
                    </div>
                  )}
                </button>

                {expanded && (
                  <div className="px-3.5 pb-3.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                    <div className="text-xs space-y-1">
                      {sale.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className="text-zinc-500 shrink-0">×{item.qty}</span>
                          <span className="font-semibold shrink-0">{fmtMoney(item.lineTotal)}</span>
                        </div>
                      ))}
                    </div>

                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-3 mb-1.5">
                      Repayments ({ledger.length})
                    </h4>
                    {ledger.length === 0 ? (
                      <p className="text-xs text-zinc-500">No repayments yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ledger.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 text-[11px] bg-zinc-50 dark:bg-zinc-800/60 rounded-xl px-3 py-2"
                          >
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                              +{fmtMoney(p.amount)}
                            </span>
                            <span className="text-zinc-500 min-w-0 truncate">
                              {p.method} · {fmtDateTime(p.createdAt)}
                              {p.receivedBy ? ` · ${p.receivedBy}` : ''}
                            </span>
                            {canManage && (
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="ml-auto p-1 text-zinc-400 hover:text-red-500 shrink-0"
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
                      <button
                        onClick={() => setPayTarget(sale)}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400"
                      >
                        <HandCoins className="w-4 h-4" /> Record payment
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {payTarget && (
        <RepaymentSheet
          sale={payTarget}
          cashierEmail={user?.email || ''}
          onClose={() => setPayTarget(null)}
        />
      )}

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

function RepaymentSheet({ sale, cashierEmail, onClose }) {
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

  const inputCls =
    'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Record payment"
    >
      <div
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border-t sm:border border-zinc-200 dark:border-zinc-800 p-5 pb-8 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-4" />
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
          <strong className="text-amber-600 dark:text-amber-400">{fmtMoney(balance)}</strong> on{' '}
          {sale.receiptNo}.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="m-repay-amount" className="block text-xs font-medium text-zinc-500 mb-1.5">
              Amount received (₦) *
            </label>
            <input
              id="m-repay-amount"
              type="number"
              min="0"
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="m-repay-method" className="block text-xs font-medium text-zinc-500 mb-1.5">
              Paid via
            </label>
            <select
              id="m-repay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={inputCls}
            >
              {REPAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="m-repay-note" className="block text-xs font-medium text-zinc-500 mb-1.5">
              Note (optional)
            </label>
            <input
              id="m-repay-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Promised the rest on Friday"
              maxLength={500}
              className={inputCls}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6 px-4 py-3.5 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Record Payment'}
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3">
      <p className={`text-sm font-bold truncate ${accent}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}
