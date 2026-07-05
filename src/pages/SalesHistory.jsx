// src/pages/SalesHistory.jsx
import { useEffect, useState, useMemo } from 'react';
import { Receipt, Search, Trash2, Printer, Filter, X } from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  writeBatch,
  getDoc,
  where,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function SalesHistory() {
  const { storeId, role, user } = useAuth();
  const [sales, setSales] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | completed | voided
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);

  const canVoid = role === 'manager' || role === 'admin' || role === 'owner';

  useEffect(() => {
    if (!storeId) return;

    const q = query(
      collection(db, 'sales'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setSales(docs);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Could not load sales history.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const statusMatch =
        filterStatus === 'all'
          ? true
          : (sale.status || 'completed') === filterStatus;

      const term = searchTerm.toLowerCase().trim();
      if (!term) return statusMatch;

      const receipt = (sale.receiptNo || sale.id).toLowerCase();
      const cashier = (sale.cashier || '').toLowerCase();

      return (
        statusMatch &&
        (receipt.includes(term) || cashier.includes(term))
      );
    });
  }, [sales, searchTerm, filterStatus]);

  const totalForPeriod = useMemo(
    () =>
      filteredSales
        .filter((s) => (s.status || 'completed') === 'completed')
        .reduce((sum, s) => sum + (s.total || 0), 0),
    [filteredSales]
  );

  const handleVoidSale = async (sale) => {
    if (!canVoid) {
      toast.error('You are not allowed to void sales.');
      return;
    }

    const currentStatus = sale.status || 'completed';

    if (currentStatus === 'voided') {
      toast.error('This receipt is already voided.');
      return;
    }

    const reason = window.prompt(
      `Enter reason for voiding receipt ${sale.receiptNo || sale.id}:`
    );
    if (!reason || !reason.trim()) {
      toast.error('Void cancelled. Reason is required.');
      return;
    }

    const ok = window.confirm(
      `Void receipt ${sale.receiptNo || sale.id}? Stock for these items will be returned.`
    );
    if (!ok) return;

    try {
      const batch = writeBatch(db);

      // 1) Restore stock for each item
      for (const item of sale.items || []) {
        if (!item.productId) continue;

        const productRef = doc(db, 'products', item.productId);
        const snap = await getDoc(productRef);

        if (!snap.exists()) continue;

        const data = snap.data();
        const currentStock = data.stock ?? 0;
        const newStock = currentStock + (item.qty || 0);

        batch.update(productRef, {
          stock: newStock,
          updatedAt: new Date(),
        });
      }

      // 2) Mark sale as voided
      const saleRef = doc(db, 'sales', sale.id);
      batch.update(saleRef, { status: 'voided' });

      // 3) Commit all writes together
      await batch.commit();

      // 4) Audit log
      await addDoc(collection(db, 'voidLogs'), {
        saleId: sale.id,
        receiptNo: sale.receiptNo || sale.id,
        storeId: sale.storeId || storeId || null,
        previousStatus: currentStatus,
        newStatus: 'voided',
        reason: reason.trim(),
        voidedByUid: user?.uid || null,
        voidedByEmail: user?.email || null,
        createdAt: serverTimestamp(),
      });

      toast.success('Sale voided, stock restored, and audit logged.');

      if (selectedSale && selectedSale.id === sale.id) {
        setSelectedSale({ ...selectedSale, status: 'voided' });
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not void sale. Please try again.');
    }
  };

  const handlePrintReceipt = (sale) => {
    const receiptNo = sale.receiptNo || sale.id;
    const createdAt = sale.createdAt
      ? new Date(sale.createdAt.toMillis())
      : new Date();

    const items = sale.items || [];

    const total =
      sale.total ||
      items.reduce(
        (sum, item) =>
          sum +
          (item.lineTotal ||
            (item.price || 0) * (item.qty || 0)),
        0
      );

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head><title>SmartStore NG • Receipt</title></head>
        <body style="font-family: monospace; padding: 30px; max-width: 400px; margin: 0 auto;">
          <h2 style="text-align:center">SmartStore NG</h2>
          <p style="text-align:center">Run Your Store Smarter</p>
          <hr/>
          <p><strong>Receipt #:</strong> ${receiptNo}</p>
          <p><strong>Date:</strong> ${createdAt.toLocaleString('en-NG')}</p>
          <p><strong>Status:</strong> ${(sale.status || 'completed').toUpperCase()}</p>
          <p><strong>Payment:</strong> ${sale.paymentMethod || '—'}</p>
          <hr/>
          ${items
            .map(
              (item) => `
            <div style="margin: 8px 0;">
              ${item.qty} × ${item.name}
              <span style="float:right">₦${(
                (item.price || 0) * (item.qty || 0)
              ).toLocaleString()}</span>
            </div>
          `
            )
            .join('')}
          <hr/>
          <h3 style="text-align:right">TOTAL: ₦${total.toLocaleString()}</h3>
          <p style="text-align:center; margin-top: 40px; font-size: 14px;">Thank You! Come Again</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const openDetails = (sale) => {
    setSelectedSale(sale);
  };

  const closeDetails = () => {
    setSelectedSale(null);
  };

  return (
    <div className="p-6 bg-zinc-950 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">Sales History</h1>
          <p className="text-zinc-400">
            View past receipts, reprint slips, and mark mistakes as void.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Total (filtered)</p>
          <p className="text-xl font-semibold text-emerald-400">
            ₦{totalForPeriod.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 text-zinc-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by receipt number or cashier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 pl-10 py-3 rounded-2xl focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-3 py-2 flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-400">Status</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-2 rounded-2xl text-xs font-medium ${
                filterStatus === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus('completed')}
              className={`px-3 py-2 rounded-2xl text-xs font-medium ${
                filterStatus === 'completed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              Completed
            </button>
            <button
              onClick={() => setFilterStatus('voided')}
              className={`px-3 py-2 rounded-2xl text-xs font-medium ${
                filterStatus === 'voided'
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              Voided
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
        <table className="w-full">
          <thead className="border-b border-zinc-800 text-sm text-zinc-400">
            <tr>
              <th className="p-4 text-left">RECEIPT</th>
              <th className="p-4 text-left">DATE / TIME</th>
              <th className="p-4 text-center">ITEMS</th>
              <th className="p-4 text-right">TOTAL</th>
              <th className="p-4 text-center">STATUS</th>
              <th className="p-4 text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="p-6 text-center text-zinc-500">
                  Loading sales…
                </td>
              </tr>
            ) : filteredSales.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-6 text-center text-zinc-500">
                  No sales match this filter.
                </td>
              </tr>
            ) : (
              filteredSales.map((sale) => {
                const createdAt = sale.createdAt
                  ? new Date(sale.createdAt.toMillis())
                  : null;
                const status = sale.status || 'completed';
                const items = sale.items || [];
                const total = sale.total || 0;

                return (
                  <tr
                    key={sale.id}
                    className="border-b border-zinc-800 hover:bg-zinc-800/40 text-sm cursor-pointer"
                    onClick={() => openDetails(sale)}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-zinc-800 rounded-xl p-2">
                          <Receipt className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">
                            {sale.receiptNo || sale.id}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {sale.cashier
                              ? `Cashier: ${sale.cashier}`
                              : 'Cashier: —'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-white text-sm">
                        {createdAt
                          ? createdAt.toLocaleDateString('en-NG')
                          : '—'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {createdAt
                          ? createdAt.toLocaleTimeString('en-NG', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </p>
                    </td>
                    <td className="p-4 text-center text-zinc-200">
                      {items.length}
                    </td>
                    <td className="p-4 text-right font-semibold text-emerald-400">
                      ₦{total.toLocaleString()}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          status === 'voided'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {status.toUpperCase()}
                      </span>
                    </td>
                    <td
                      className="p-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handlePrintReceipt(sale)}
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 mr-3"
                      >
                        <Printer className="w-4 h-4" />
                        <span className="text-xs">Print</span>
                      </button>
                      <button
                        onClick={() => handleVoidSale(sale)}
                        disabled={!canVoid}
                        className={`inline-flex items-center gap-1 text-red-400 hover:text-red-300 ${
                          !canVoid ? 'opacity-40 cursor-not-allowed hover:text-red-400' : ''
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-xs">Void</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Details drawer / modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-end z-50">
          <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-zinc-500">Receipt</p>
                <h2 className="text-xl font-semibold text-white">
                  {selectedSale.receiptNo || selectedSale.id}
                </h2>
              </div>
              <button
                onClick={closeDetails}
                className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-xs text-zinc-500">Date / Time</p>
                <p className="text-sm text-white">
                  {selectedSale.createdAt
                    ? new Date(
                        selectedSale.createdAt.toMillis()
                      ).toLocaleString('en-NG')
                    : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">Status</p>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold inline-block ${
                    (selectedSale.status || 'completed') === 'voided'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {(selectedSale.status || 'completed').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <p className="text-xs text-zinc-500">Items</p>
                <p className="text-lg font-semibold text-white">
                  {(selectedSale.items || []).length}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Total</p>
                <p className="text-lg font-semibold text-emerald-400">
                  ₦{(selectedSale.total || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Cashier</p>
                <p className="text-sm text-white">
                  {selectedSale.cashier || '—'}
                </p>
              </div>
            </div>

            <div className="mt-4 mb-4 text-xs text-zinc-500 uppercase tracking-wide">
              Line Items
            </div>

            <div className="flex-1 overflow-auto space-y-2">
              {(selectedSale.items || []).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-zinc-900 rounded-2xl px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-white">{item.name}</p>
                    <p className="text-xs text-zinc-500">
                      {item.qty} × ₦{(item.price || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold text-emerald-400">
                    ₦{(
                      (item.price || 0) * (item.qty || 0)
                    ).toLocaleString()}
                  </div>
                </div>
              ))}

              {(selectedSale.items || []).length === 0 && (
                <p className="text-sm text-zinc-500">
                  No line items stored for this sale.
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => handlePrintReceipt(selectedSale)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print receipt
              </button>
              <button
                onClick={() => handleVoidSale(selectedSale)}
                disabled={!canVoid}
                className={`flex-1 bg-zinc-900 hover:bg-zinc-800 border border-red-500/40 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 text-red-400 ${
                  !canVoid ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <Trash2 className="w-4 h-4" />
                Void sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}