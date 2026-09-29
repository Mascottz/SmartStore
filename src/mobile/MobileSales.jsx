// src/mobile/MobileSales.jsx
// Every receipt this shop has issued, as a thumb-friendly list: chips for the
// status filter, tap-to-expand line items, thermal reprint and (for roles
// allowed to) void with a reason. Mirrors the main Sales History.
import { useMemo, useState } from 'react';
import { Ban, ChevronDown, ChevronUp, Download, Printer, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtMoney, fmtDateTime } from '../lib/format';
import { printReceipt } from '../lib/printReceipt';
import { sanitize } from '../lib/validate';
import { downloadCsv } from '../lib/exportCsv';
import { saleBalance } from '../lib/credit';
import HelpTip from '../components/HelpTip';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
];

export default function MobileSales() {
  const { storeId, user, role, niche, storeName, store } = useAuth();

  const { data: sales, loading } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );
  const { data: team } = useStoreData(
    () => (storeId ? api.team.list(storeId) : []),
    [storeId]
  );
  const roleByEmail = useMemo(() => {
    const map = new Map();
    for (const member of team) {
      if (member?.email) map.set(member.email.toLowerCase(), member.role);
    }
    return map;
  }, [team]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 200);
  const canVoid = ['owner', 'admin', 'manager'].includes(role);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return sales.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (!term) return true;
      return (
        s.receiptNo.toLowerCase().includes(term) ||
        s.items.some((i) => i.name.toLowerCase().includes(term))
      );
    });
  }, [sales, debouncedSearch, filter]);

  const handleVoid = async () => {
    if (!voidTarget) return;
    const reason = sanitize(voidReason) || 'No reason given';
    setVoiding(true);
    try {
      await api.sales.void(voidTarget.id, reason, user?.email || '', niche.trackStock);
      toast.success(
        `Sale ${voidTarget.receiptNo} voided${niche.trackStock ? ' and stock restored' : ''}.`
      );
      setVoidTarget(null);
      setVoidReason('');
    } catch (e) {
      toast.error(e.message || 'Could not void sale.');
    } finally {
      setVoiding(false);
    }
  };

  const printThermalReceipt = (sale) => {
    const cashierEmail = sale.cashierEmail || '';
    const printed = printReceipt({
      storeName: storeName || 'SmartStore NG',
      receiptNo: sale.receiptNo,
      createdAt: sale.createdAt,
      items: sale.items,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      amountPaid: sale.amountPaid,
      customerName: sale.customerName || '',
      cashier: cashierEmail,
      cashierRole: roleByEmail.get(cashierEmail.toLowerCase()) || '',
      status: sale.status,
    });
    if (!printed) toast.error('Pop-up blocked. Please allow pop-ups for receipts.');
  };

  const handleExport = () => {
    const headers = ['Receipt', 'Date', 'Payment', 'Customer', 'Items', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = filtered.map((s) => [
      s.receiptNo,
      fmtDateTime(s.createdAt),
      s.paymentMethod,
      s.customerName || '',
      s.items.length,
      s.total,
      s.amountPaid ?? s.total,
      saleBalance(s),
      s.status,
    ]);
    downloadCsv(`${store?.name || 'sales'}-export`, headers, rows);
    toast.success('Exported to CSV');
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Sales
            <HelpTip
              label="Help: Sales (monitoring)"
              text="Every receipt this store has ever issued. Tap one to expand its items, reprint it, or void it. Voided receipts stay listed, struck through, so the record is never lost."
            />
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {sales.length} transaction{sales.length !== 1 ? 's' : ''}
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExport}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:border-emerald-500"
            aria-label="Export sales to CSV"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        )}
      </div>

      {/* Search + chips */}
      <div className="sticky top-[61px] z-20 -mx-4 px-4 py-2 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Receipt number or item…"
            aria-label="Search sales"
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

      {/* Receipts */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl h-20"
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-sm text-zinc-500">
              {debouncedSearch ? `No sales match "${debouncedSearch}".` : 'No sales found.'}
            </p>
          </div>
        ) : (
          filtered.map((sale) => {
            const expanded = expandedId === sale.id;
            const balance = saleBalance(sale);
            const owesMoney = balance > 0 && sale.status === 'completed';
            return (
              <div
                key={sale.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : sale.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-3 p-3.5 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{sale.receiptNo}</p>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          sale.status === 'voided'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                        }`}
                      >
                        {sale.status}
                      </span>
                      {owesMoney && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          Owes {fmtMoney(balance)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                      {fmtDateTime(sale.createdAt)} · {sale.paymentMethod} · {sale.items.length} item
                      {sale.items.length !== 1 ? 's' : ''}
                      {sale.customerName ? ` · ${sale.customerName}` : ''}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-bold shrink-0 ${
                      sale.status === 'voided' ? 'line-through text-zinc-400' : ''
                    }`}
                  >
                    {fmtMoney(sale.total)}
                  </p>
                  {expanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
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
                    {sale.customerName && (
                      <p className="text-[11px] text-zinc-500 mt-2">
                        {sale.customerName} paid {fmtMoney(Number(sale.amountPaid ?? sale.total))} of{' '}
                        {fmtMoney(sale.total)}
                        {owesMoney ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            {' '}
                            · {fmtMoney(balance)} outstanding
                          </span>
                        ) : (
                          ', settled'
                        )}
                      </p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => printThermalReceipt(sale)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:border-emerald-500"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print
                      </button>
                      {canVoid && sale.status === 'completed' && (
                        <button
                          onClick={() => {
                            setVoidTarget(sale);
                            setVoidReason('');
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 dark:border-red-900 text-xs font-semibold text-red-500 hover:bg-red-500/10"
                        >
                          <Ban className="w-3.5 h-3.5" /> Void
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Void sheet */}
      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
          onClick={() => setVoidTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Void sale"
        >
          <div
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border-t sm:border border-zinc-200 dark:border-zinc-800 p-5 pb-8 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-4" />
            <h3 className="font-bold text-lg mb-1">Void sale {voidTarget.receiptNo}?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              This marks the sale as voided
              {niche.trackStock ? ' and restores stock levels' : ''}. Total:{' '}
              <strong>{fmtMoney(voidTarget.total)}</strong>
            </p>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">
              Reason for void *
            </label>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Customer returned item"
              maxLength={500}
              autoFocus
              className="w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setVoidTarget(null)}
                className="flex-1 px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={voiding || !voidReason.trim()}
                className="flex-1 px-4 py-3 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
              >
                {voiding ? 'Voiding…' : 'Void Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
