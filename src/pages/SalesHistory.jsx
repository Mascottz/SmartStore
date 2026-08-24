// src/pages/SalesHistory.jsx
import { useMemo, useState } from 'react';
import { Search, Printer, Ban, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney, fmtDateTime } from '../lib/format';

export default function SalesHistory() {
  const { storeId, user, role, niche, storeName } = useAuth();

  const { data: sales, loading } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all | completed | voided
  const [expandedId, setExpandedId] = useState(null);

  const canVoid = ['owner', 'admin', 'manager'].includes(role);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return sales.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (!term) return true;
      return (
        s.receiptNo.toLowerCase().includes(term) ||
        s.items.some((i) => i.name.toLowerCase().includes(term))
      );
    });
  }, [sales, searchTerm, filter]);

  const handleVoid = async (sale) => {
    const reason = window.prompt(
      `Void sale ${sale.receiptNo} (${fmtMoney(sale.total)})?\nEnter a reason:`
    );
    if (reason === null) return;
    try {
      await api.sales.void(sale.id, reason, user?.email || '', niche.trackStock);
      toast.success(`Sale ${sale.receiptNo} voided${niche.trackStock ? ' and stock restored' : ''}.`);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not void sale.');
    }
  };

  const printReceipt = (sale) => {
    const rows = sale.items
      .map(
        (i) =>
          `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${fmtMoney(
            i.price * i.qty
          )}</td></tr>`
      )
      .join('');
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>${storeName} • Receipt</title></head>
        <body style="font-family: monospace; padding: 30px; max-width: 400px; margin: 0 auto;">
          <h2 style="text-align:center">${storeName}</h2>
          <hr/>
          <p><strong>Receipt #:</strong> ${sale.receiptNo}</p>
          <p><strong>Date:</strong> ${fmtDateTime(sale.createdAt)}</p>
          <p><strong>Payment:</strong> ${sale.paymentMethod}</p>
          ${sale.status === 'voided' ? '<p style="color:red"><strong>*** VOIDED ***</strong></p>' : ''}
          <hr/>
          <table style="width:100%; font-size: 13px;">
            <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <hr/>
          <h3 style="text-align:right">TOTAL: ${fmtMoney(sale.total)}</h3>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Sales History</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          {sales.length} transactions
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by receipt number or item..."
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none"
        >
          <option value="all">All sales</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-zinc-500 text-sm py-10 text-center">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-zinc-500 text-sm py-10 text-center">No sales found.</p>
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
                      {fmtDateTime(sale.createdAt)} · {sale.paymentMethod} ·{' '}
                      {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                      {sale.cashierEmail && <> · {sale.cashierEmail}</>}
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
                            <td className="py-1 text-center text-zinc-500">×{item.qty}</td>
                            <td className="py-1 text-right">{fmtMoney(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => printReceipt(sale)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-medium hover:border-emerald-500"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print receipt
                      </button>
                      {canVoid && sale.status === 'completed' && (
                        <button
                          onClick={() => handleVoid(sale)}
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
    </div>
  );
}
