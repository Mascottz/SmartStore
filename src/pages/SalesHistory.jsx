// src/pages/SalesHistory.jsx
import { useMemo, useState } from 'react';
import { Search, Printer, Ban, ChevronDown, ChevronUp, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtMoney, fmtDateTime } from '../lib/format';
import { printReceipt } from '../lib/printReceipt';
import { sanitize } from '../lib/validate';
import { downloadCsv } from '../lib/exportCsv';

export default function SalesHistory() {
  const { storeId, user, role, niche, storeName, store } = useAuth();

  const { data: sales, loading } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all | completed | voided
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
      toast.success(`Sale ${voidTarget.receiptNo} voided${niche.trackStock ? ' and stock restored' : ''}.`);
      setVoidTarget(null);
      setVoidReason('');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not void sale.');
    } finally {
      setVoiding(false);
    }
  };

  // Thermal 80mm receipt reprint
  const printThermalReceipt = (sale) => {
    const printed = printReceipt({
      storeName: storeName || 'SmartStore NG',
      receiptNo: sale.receiptNo,
      createdAt: sale.createdAt,
      items: sale.items,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      cashier: sale.cashierEmail || '',
      status: sale.status,
    });
    if (!printed) toast.error('Pop-up blocked. Please allow pop-ups for receipts.');
  };

  const handleExport = () => {
    const headers = ['Receipt', 'Date', 'Payment', 'Items', 'Total', 'Status'];
    const rows = filtered.map((s) => [
      s.receiptNo,
      fmtDateTime(s.createdAt),
      s.paymentMethod,
      s.items.length,
      s.total,
      s.status,
    ]);
    downloadCsv(`${store?.name || 'sales'}-export`, headers, rows);
    toast.success('Exported to CSV');
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Sales History</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {sales.length} transaction{sales.length !== 1 ? 's' : ''}
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:border-emerald-500 transition-all"
            aria-label="Export sales to CSV"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by receipt number or item..."
            aria-label="Search sales"
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter sales"
          className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none"
        >
          <option value="all">All sales</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 h-20"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-zinc-500 text-sm py-10 text-center">
            {debouncedSearch
              ? `No sales match "${debouncedSearch}".`
              : 'No sales found.'}
          </p>
        ) : (
          filtered.map((sale) => {
            const expanded = expandedId === sale.id;
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
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{sale.receiptNo}</p>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                          sale.status === 'voided'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                        }`}
                      >
                        {sale.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {fmtDateTime(sale.createdAt)} &middot; {sale.paymentMethod} &middot;{' '}
                      {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                      {sale.cashierEmail && <> &middot; {sale.cashierEmail}</>}
                    </p>
                  </div>
                  <p
                    className={`font-bold ${
                      sale.status === 'voided' ? 'line-through text-zinc-400' : ''
                    }`}
                  >
                    {fmtMoney(sale.total)}
                  </p>
                  {expanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </button>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">
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
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => printThermalReceipt(sale)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-medium hover:border-emerald-500"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print receipt
                      </button>
                      {canVoid && sale.status === 'completed' && (
                        <button
                          onClick={() => {
                            setVoidTarget(sale);
                            setVoidReason('');
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-red-300 dark:border-red-900 text-xs font-medium text-red-500 hover:bg-red-500/10"
                        >
                          <Ban className="w-3.5 h-3.5" /> Void sale
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

      {/* Void confirmation with reason input */}
      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setVoidTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Void sale"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-2">Void sale {voidTarget.receiptNo}?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              This will mark the sale as voided{niche.trackStock ? ' and restore stock levels' : ''}.
              Total: <strong>{fmtMoney(voidTarget.total)}</strong>
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
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setVoidTarget(null)}
                className="px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={voiding || !voidReason.trim()}
                className="px-4 py-2.5 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
              >
                {voiding ? 'Voiding...' : 'Void Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
