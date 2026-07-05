// src/pages/VoidReports.jsx
import { useEffect, useState, useMemo } from 'react';
import { X, Calendar, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import OwnerFeatureGate from '../components/OwnerFeatureGate'; // ✅ NEW

export default function VoidReports() {
  const { storeId, role } = useAuth();

  // Only managers/admins/owners inside this store
  const canView =
    role === 'manager' || role === 'admin' || role === 'owner';

  const [voidLogs, setVoidLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [saleDetails, setSaleDetails] = useState(null);

  // Date range filter
  const [fromDate, setFromDate] = useState(''); // yyyy-mm-dd
  const [toDate, setToDate] = useState('');     // yyyy-mm-dd

  useEffect(() => {
    if (!storeId) return;

    if (!canView) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'voidLogs'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setVoidLogs(logs);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Could not load void logs.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId, canView]);

  const filteredLogs = useMemo(() => {
    if (!fromDate && !toDate) return voidLogs;

    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return voidLogs.filter((log) => {
      const createdAt = log.createdAt?.toMillis
        ? new Date(log.createdAt.toMillis())
        : null;
      if (!createdAt) return false;

      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    });
  }, [voidLogs, fromDate, toDate]);

  const handleViewSale = async (log) => {
    setSelectedLog(log);
    setSaleDetails(null);

    try {
      const saleRef = doc(db, 'sales', log.saleId);
      const snap = await getDoc(saleRef);
      if (!snap.exists()) {
        toast.error('Sale document not found.');
        return;
      }
      setSaleDetails({ id: snap.id, ...snap.data() });
    } catch (err) {
      console.error(err);
      toast.error('Could not load sale details.');
    }
  };

  const closeDetails = () => {
    setSelectedLog(null);
    setSaleDetails(null);
  };

  if (!canView) {
    return (
      <OwnerFeatureGate>
        <div className="p-6 bg-zinc-950 min-h-screen">
          <h1 className="text-4xl font-bold text-white mb-4">
            Void Reports
          </h1>
          <p className="text-zinc-400">
            You don’t have permission to view void reports.
          </p>
        </div>
      </OwnerFeatureGate>
    );
  }

  return (
    <OwnerFeatureGate>
      <div className="p-6 bg-zinc-950 min-h-screen">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">Void Reports</h1>
            <p className="text-zinc-400">
              Review all voided sales, who did it, and why.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-3 py-2 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-400">From</span>
          </div>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl px-3 py-2 text-sm"
          />

          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-3 py-2 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-400">To</span>
          </div>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl px-3 py-2 text-sm"
          />
        </div>

        {/* Table */}
        <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
          <table className="w-full">
            <thead className="border-b border-zinc-800 text-sm text-zinc-400">
              <tr>
                <th className="p-4 text-left">DATE / TIME</th>
                <th className="p-4 text-left">RECEIPT</th>
                <th className="p-4 text-left">VOIDED BY</th>
                <th className="p-4 text-left">CASHIER</th>
                <th className="p-4 text-right">AMOUNT</th>
                <th className="p-4 text-left">REASON</th>
                <th className="p-4 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-zinc-500">
                    Loading void logs…
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-zinc-500">
                    No voids found in this period.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const createdAt = log.createdAt?.toMillis
                    ? new Date(log.createdAt.toMillis())
                    : null;

                  const amount = Number(log.saleTotal || 0);
                  const cashier = log.cashier || '—';

                  return (
                    <tr
                      key={log.id}
                      className="border-b border-zinc-800 hover:bg-zinc-800/40 text-sm cursor-pointer"
                      onClick={() => handleViewSale(log)}
                    >
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
                      <td className="p-4">
                        <p className="font-semibold text-white">
                          {log.receiptNo || '—'}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-white text-sm">
                          {log.voidedByEmail ||
                            log.voidedByUid ||
                            '—'}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-zinc-400 text-sm">
                          {cashier}
                        </p>
                      </td>
                      <td className="p-4 text-right">
                        <p className="font-semibold text-emerald-400">
                          ₦{amount.toLocaleString()}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-zinc-300 text-sm">
                          {log.reason || '—'}
                        </p>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          className="text-blue-400 hover:text-blue-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewSale(log);
                          }}
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Side drawer for sale details */}
        {selectedLog && saleDetails && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-end z-50">
            <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-zinc-500">Void details</p>
                  <h2 className="text-xl font-semibold text-white">
                    {selectedLog.receiptNo || selectedLog.saleId}
                  </h2>
                </div>
                <button
                  onClick={closeDetails}
                  className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-xs text-zinc-500">Voided by</p>
                  <p className="text-white">
                    {selectedLog.voidedByEmail ||
                      selectedLog.voidedByUid ||
                      '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Cashier</p>
                  <p className="text-white">
                    {selectedLog.cashier || saleDetails.cashier || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Date / Time</p>
                  <p className="text-white">
                    {selectedLog.createdAt?.toMillis
                      ? new Date(
                          selectedLog.createdAt.toMillis()
                        ).toLocaleString('en-NG')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Amount</p>
                  <p className="text-emerald-400 font-semibold">
                    ₦{Number(saleDetails.total || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="mt-4 mb-4 text-xs text-zinc-500 uppercase tracking-wide">
                Reason
              </div>
              <p className="text-sm text-zinc-300 mb-6">
                {selectedLog.reason || '—'}
              </p>

              <div className="mt-4 mb-4 text-xs text-zinc-500 uppercase tracking-wide">
                Items Voided
              </div>

              <div className="flex-1 overflow-auto space-y-2">
                {(saleDetails.items || []).map((item, idx) => (
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

                {(saleDetails.items || []).length === 0 && (
                  <p className="text-sm text-zinc-500">
                    No line items found for this sale.
                  </p>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>
                    This sale is marked as voided in the system.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </OwnerFeatureGate>
  );
}