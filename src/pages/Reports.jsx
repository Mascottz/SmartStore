// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  DollarSign,
  Receipt,
  AlertTriangle,
  PieChart,
  ShoppingBag,
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import OwnerFeatureGate from '../components/OwnerFeatureGate'; // ✅ NEW

const getRangeForFilter = (filter) => {
  const now = new Date();
  const start = new Date();

  if (filter === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (filter === 'week') {
    // Start from Monday of this week
    const day = start.getDay(); // 0 = Sun
    const diff = (day === 0 ? -6 : 1) - day;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
  } else if (filter === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end: now };
};

export default function Reports() {
  const { storeId } = useAuth();

  const [filter, setFilter] = useState('today'); // today | week | month
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;

    const { start } = getRangeForFilter(filter);

    // Sales for this store in period
    const qSales = query(
      collection(db, 'sales'),
      where('storeId', '==', storeId),
      where('createdAt', '>=', start)
    );

    // Expenses for this store in period
    const qExpenses = query(
      collection(db, 'expenses'),
      where('storeId', '==', storeId),
      where('date', '>=', start)
    );

    const unsubSales = onSnapshot(qSales, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSales(docs);
      setLoading(false);
    });

    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setExpenses(docs);
    });

    return () => {
      unsubSales();
      unsubExpenses();
    };
  }, [filter, storeId]);

  const {
    completedSales,
    voidedSales,
    totalSalesAmount,
    totalVoidedAmount,
    totalReceipts,
    avgTicket,
    paymentBreakdown,
    topProducts,
    totalExpenseAmount,
    profitAfterExpenses,
  } = useMemo(() => {
    const completed = sales.filter(
      (s) => (s.status || 'completed') === 'completed'
    );
    const voided = sales.filter((s) => s.status === 'voided');

    const totalSales = completed.reduce(
      (sum, s) => sum + (s.total || 0),
      0
    );
    const totalVoided = voided.reduce(
      (sum, s) => sum + (s.total || 0),
      0
    );

    const receipts = completed.length;
    const avg =
      receipts > 0 ? Math.round(totalSales / receipts) : 0;

    const paymentMap = {};
    completed.forEach((s) => {
      const method = s.paymentMethod || 'Unknown';
      paymentMap[method] =
        (paymentMap[method] || 0) + (s.total || 0);
    });

    const paymentArr = Object.entries(paymentMap).map(
      ([method, amount]) => ({
        method,
        amount,
      })
    );

    const productMap = {};
    completed.forEach((s) => {
      (s.items || []).forEach((item) => {
        if (!item.productId) return;
        const key = item.productId;
        if (!productMap[key]) {
          productMap[key] = {
            productId: key,
            name: item.name || 'Unknown item',
            qty: 0,
            revenue: 0,
          };
        }
        productMap[key].qty += item.qty || 0;
        productMap[key].revenue +=
          (item.price || 0) * (item.qty || 0);
      });
    });

    const topProd = Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const totalExp = expenses.reduce(
      (sum, e) => sum + (e.amount || 0),
      0
    );

    const profit = totalSales - totalExp;

    return {
      completedSales: completed,
      voidedSales: voided,
      totalSalesAmount: totalSales,
      totalVoidedAmount: totalVoided,
      totalReceipts: receipts,
      avgTicket: avg,
      paymentBreakdown: paymentArr,
      topProducts: topProd,
      totalExpenseAmount: totalExp,
      profitAfterExpenses: profit,
    };
  }, [sales, expenses]);

  const totalPayment = paymentBreakdown.reduce(
    (sum, p) => sum + p.amount,
    0
  );

  return (
    <OwnerFeatureGate>
      <div className="p-8 bg-zinc-950 min-h-screen">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">Reports</h1>
            <p className="text-zinc-400">
              See how your shop is performing over time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <span className="text-xs text-zinc-400">Period</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('today')}
                className={`px-3 py-2 rounded-2xl text-xs font-medium ${
                  filter === 'today'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-900 text-zinc-400'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setFilter('week')}
                className={`px-3 py-2 rounded-2xl text-xs font-medium ${
                  filter === 'week'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-900 text-zinc-400'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setFilter('month')}
                className={`px-3 py-2 rounded-2xl text-xs font-medium ${
                  filter === 'month'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-900 text-zinc-400'
                }`}
              >
                This Month
              </button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {/* Total Sales */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-zinc-400 tracking-wide">
                  TOTAL SALES
                </p>
                <p className="text-3xl font-bold mt-2">
                  ₦{totalSalesAmount.toLocaleString()}
                </p>
                <p className="text-xs text-emerald-400 mt-1">
                  Completed receipts only
                </p>
              </div>
              <div className="bg-emerald-500/10 rounded-2xl p-3">
                <DollarSign className="w-7 h-7 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Total Receipts */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-zinc-400 tracking-wide">
                  TOTAL RECEIPTS
                </p>
                <p className="text-3xl font-bold mt-2 text-emerald-400">
                  {totalReceipts}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Sales in this period
                </p>
              </div>
              <div className="bg-emerald-500/10 rounded-2xl p-3">
                <Receipt className="w-7 h-7 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Total Expenses */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-zinc-400 tracking-wide">
                  TOTAL EXPENSES
                </p>
                <p className="text-3xl font-bold mt-2 text-amber-400">
                  ₦{totalExpenseAmount.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Costs recorded in this period
                </p>
              </div>
              <div className="bg-amber-500/10 rounded-2xl p-3">
                <DollarSign className="w-7 h-7 text-amber-400" />
              </div>
            </div>
          </div>

          {/* Profit After Expenses */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-zinc-400 tracking-wide">
                  PROFIT AFTER EXPENSES
                </p>
                <p
                  className={`text-3xl font-bold mt-2 ${
                    profitAfterExpenses < 0
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                >
                  ₦{profitAfterExpenses.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Sales minus expenses (voids excluded)
                </p>
              </div>
              <div className="bg-emerald-500/10 rounded-2xl p-3">
                <DollarSign className="w-7 h-7 text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: payment + top products */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Payment breakdown */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-zinc-800 rounded-xl p-2">
                  <PieChart className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-white">
                  Payment Breakdown
                </h3>
              </div>
            </div>

            {paymentBreakdown.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No completed sales in this period.
              </p>
            ) : (
              <div className="space-y-3">
                {paymentBreakdown.map((p) => {
                  const share =
                    totalPayment > 0
                      ? Math.round((p.amount / totalPayment) * 100)
                      : 0;
                  return (
                    <div
                      key={p.method}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-zinc-300">{p.method}</span>
                          <span className="text-zinc-500">
                            {share}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-2 bg-emerald-500"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right w-28">
                        <p className="text-sm font-semibold text-emerald-400">
                          ₦{p.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top products */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-zinc-800 rounded-xl p-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-white">
                  Top Products
                </h3>
              </div>
            </div>

            {topProducts.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No completed sales in this period.
              </p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p) => (
                  <div
                    key={p.productId}
                    className="flex items-center justify-between bg-zinc-800/60 rounded-2xl px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {p.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {p.qty} units sold
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-400">
                        ₦{p.revenue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading && (
          <p className="mt-6 text-xs text-zinc-500">
            Loading report…
          </p>
        )}
      </div>
    </OwnerFeatureGate>
  );
}