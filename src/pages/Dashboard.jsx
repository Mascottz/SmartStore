// src/pages/Dashboard.jsx
import SupermarketOnboardingCard from '../components/onboarding/SupermarketOnboardingCard';
import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Receipt,
  ShoppingBag,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import OwnerFeatureGate from '../components/OwnerFeatureGate';

// helper: start of today (midnight)
const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const monthKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabelFromKey = (key) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-NG', { month: 'short' });
};

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    storeId,
    store,
    storeName,
    onboardingCompleted, // 👈 from AuthContext
  } = useAuth();

  const [stats, setStats] = useState({
    todaySales: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
  });

  const [recentSales, setRecentSales] = useState([]);
  const [hourlySales, setHourlySales] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);

  // Data for monthly chart
  const [allSales, setAllSales] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);

  // Chart mode: 'both' | 'sales' | 'expenses'
  const [chartMode, setChartMode] = useState('both');

  useEffect(() => {
    // Wait for auth to resolve
    if (!storeId) return;

    const startOfToday = getStartOfToday();
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    // Sales query (today) scoped to store
    const qSalesToday = query(
      collection(db, 'sales'),
      where('storeId', '==', storeId),
      where('createdAt', '>=', startOfToday)
    );

    // Sales for year (for monthly chart) scoped to store
    const qSalesYear = query(
      collection(db, 'sales'),
      where('storeId', '==', storeId),
      where('createdAt', '>=', startOfYear),
      where('createdAt', '<=', endOfYear)
    );

    // Expenses query (today) scoped to store
    const qExpensesToday = query(
      collection(db, 'expenses'),
      where('storeId', '==', storeId),
      where('createdAt', '>=', startOfToday)
    );

    // Expenses for year (for monthly chart) scoped to store
    const qExpensesYear = query(
      collection(db, 'expenses'),
      where('storeId', '==', storeId),
      where('date', '>=', startOfYear),
      where('date', '<=', endOfYear)
    );

    // Today sales listener
    const unsubSalesToday = onSnapshot(qSalesToday, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const completedSales = docs.filter(
        (sale) => (sale.status || 'completed') === 'completed'
      );

      const totalToday = completedSales.reduce(
        (sum, sale) => sum + (sale.total || 0),
        0
      );

      setStats((prev) => ({
        ...prev,
        todaySales: totalToday,
        netProfit: totalToday - prev.expenses,
      }));

      const sorted = [...docs]
        .filter((sale) => sale.createdAt)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
        .slice(0, 5);

      setRecentSales(sorted);

      const hourlyMap = {};
      completedSales.forEach((sale) => {
        if (!sale.createdAt) return;
        const d = sale.createdAt.toDate
          ? sale.createdAt.toDate()
          : new Date(sale.createdAt.toMillis());
        const hour = d.getHours();
        if (hour < 8 || hour > 20) return;
        const key = `${hour}:00`;
        hourlyMap[key] = (hourlyMap[key] || 0) + (sale.total || 0);
      });

      const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const hourly = hours.map((h) => {
        const label =
          h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`;
        const key = `${h}:00`;
        return {
          hour: label,
          amount: hourlyMap[key] || 0,
        };
      });

      setHourlySales(hourly);
    });

    // Today expenses listener
    const unsubExpensesToday = onSnapshot(qExpensesToday, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const totalExpenses = docs.reduce(
        (sum, e) => sum + (e.amount || 0),
        0
      );

      setStats((prev) => ({
        ...prev,
        expenses: totalExpenses,
        netProfit: prev.todaySales - totalExpenses,
      }));
    });

    // Year sales listener (for monthly chart)
    const unsubSalesYear = onSnapshot(qSalesYear, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAllSales(docs);
    });

    // Year expenses listener (for monthly chart)
    const unsubExpensesYear = onSnapshot(qExpensesYear, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAllExpenses(docs);
    });

    return () => {
      unsubSalesToday();
      unsubExpensesToday();
      unsubSalesYear();
      unsubExpensesYear();
    };
  }, [storeId]);

  // Build monthly aggregation for the current year
  const monthlyData = useMemo(() => {
    const year = new Date().getFullYear();
    const map = {};

    // initialize months Jan..Dec
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      map[key] = {
        month: monthLabelFromKey(key),
        sales: 0,
        expenses: 0,
      };
    }

    // Aggregate sales (completed only)
    allSales.forEach((s) => {
      if (!s.createdAt) return;
      if ((s.status || 'completed') !== 'completed') return;
      const d = s.createdAt.toDate
        ? s.createdAt.toDate()
        : new Date(s.createdAt.toMillis());
      if (d.getFullYear() !== year) return;
      const key = monthKey(d);
      map[key] =
        map[key] || {
          month: monthLabelFromKey(key),
          sales: 0,
          expenses: 0,
        };
      map[key].sales += s.total || 0;
    });

    // Aggregate expenses (still using 'date')
    allExpenses.forEach((e) => {
      if (!e.date) return;
      const d = e.date.toDate ? e.date.toDate() : new Date(e.date);
      if (d.getFullYear() !== year) return;
      const key = monthKey(d);
      map[key] =
        map[key] || {
          month: monthLabelFromKey(key),
          sales: 0,
          expenses: 0,
        };
      map[key].expenses += e.amount || 0;
    });

    return Object.keys(map)
      .sort()
      .map((k) => ({
        key: k,
        month: map[k].month,
        sales: Math.round(map[k].sales),
        expenses: Math.round(map[k].expenses),
      }));
  }, [allSales, allExpenses]);

  const maxAmount = Math.max(
    ...hourlySales.map((h) => h.amount),
    1
  );

  const ytdSales = monthlyData.reduce(
    (s, m) => s + (m.sales || 0),
    0
  );
  const ytdExpenses = monthlyData.reduce(
    (s, m) => s + (m.expenses || 0),
    0
  );
  const ytdNet = ytdSales - ytdExpenses;

  const onboarding = store?.onboarding;
  const businessType = onboarding?.businessType;
  const title = storeName || 'SmartStore';

  // (Optional) manual complete handler, still available if the card uses it
  const handleOnboardingComplete = async () => {
    if (!storeId) return;
    try {
      const ref = doc(db, 'stores', storeId);
      await updateDoc(ref, {
        'onboarding.completed': true,
      });
    } catch (err) {
      console.error('Error marking onboarding complete', err);
    }
  };

  return (
    <div className="p-8 bg-zinc-950 min-h-screen">
      {/* Supermarket onboarding card:
          now hidden automatically when global onboardingCompleted is true */}
      {businessType === 'supermarket' &&
        onboarding &&
        !onboardingCompleted && (
          <SupermarketOnboardingCard
            onboarding={onboarding}
            onComplete={handleOnboardingComplete}
          />
        )}

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">
            {title}
          </h1>
          <p className="text-zinc-400">
            Clear view of how your shop is doing today.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-400">Today</p>
          <p className="text-emerald-400 text-sm font-medium">
            {new Date().toLocaleDateString('en-NG')}
          </p>
        </div>
      </div>

      {/* Top stats (kept free) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {/* Today’s Sales */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-zinc-400 tracking-wide">
                TODAY&apos;S SALES
              </p>
              <p className="text-3xl font-bold mt-2">
                ₦{stats.todaySales.toLocaleString()}
              </p>
              <p className="text-xs text-emerald-400 mt-1">
                Live total from SmartStore POS
              </p>
            </div>
            <div className="bg-emerald-500/10 rounded-2xl p-3">
              <DollarSign className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Gross Profit */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-zinc-400 tracking-wide">
                GROSS PROFIT
              </p>
              <p className="text-3xl font-bold mt-2 text-emerald-400">
                ₦{stats.grossProfit.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Before rent, fuel, and other wahala
              </p>
            </div>
            <div className="bg-emerald-500/10 rounded-2xl p-3">
              <TrendingUp className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Today’s Expenses */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-zinc-400 tracking-wide">
                TODAY&apos;S EXPENSES
              </p>
              <p className="text-3xl font-bold mt-2 text-amber-400">
                ₦{stats.expenses.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Fuel, staff, light bill, small small runs
              </p>
            </div>
            <div className="bg-amber-500/10 rounded-2xl p-3">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
          </div>
        </div>

        {/* Net Profit */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-zinc-400 tracking-wide">
                NET PROFIT (TODAY)
              </p>
              <p
                className={`text-3xl font-bold mt-2 ${
                  stats.netProfit < 0
                    ? 'text-red-400'
                    : 'text-emerald-400'
                }`}
              >
                ₦{stats.netProfit.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Today&apos;s sales minus expenses
              </p>
            </div>
            <div className="bg-red-500/10 rounded-2xl p-3">
              <DollarSign className="w-7 h-7 text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Monthly chart + YTD summary (Owner only) */}
      <OwnerFeatureGate>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          {/* Monthly Sales vs Expenses chart */}
          <div className="lg:col-span-2 bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-500/10 rounded-xl p-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">
                    Monthly Sales vs Expenses
                  </h3>
                  <p className="text-xs text-zinc-500">
                    This year — month by month
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">
                  Year: {new Date().getFullYear()}
                </span>
                <div className="ml-3 flex rounded-full bg-zinc-800 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setChartMode('both')}
                    className={`px-3 py-1 rounded-full ${
                      chartMode === 'both'
                        ? 'bg-emerald-500 text-black'
                        : 'text-zinc-300'
                    }`}
                  >
                    Both
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('sales')}
                    className={`px-3 py-1 rounded-full ${
                      chartMode === 'sales'
                        ? 'bg-emerald-500 text-black'
                        : 'text-zinc-300'
                    }`}
                  >
                    Sales
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('expenses')}
                    className={`px-3 py-1 rounded-full ${
                      chartMode === 'expenses'
                        ? 'bg-emerald-500 text-black'
                        : 'text-zinc-300'
                    }`}
                  >
                    Expenses
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 h-72">
              {monthlyData.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No data for this year yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid
                      stroke="#27272a"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="#a1a1aa"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#a1a1aa"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) =>
                        `₦${v.toLocaleString()}`
                      }
                    />
                    <Tooltip
                      formatter={(v) =>
                        `₦${Number(v).toLocaleString()}`
                      }
                    />
                    <Legend />
                    {(chartMode === 'both' ||
                      chartMode === 'sales') && (
                      <Bar
                        dataKey="sales"
                        fill="#22c55e"
                        name="Sales"
                        radius={[6, 6, 0, 0]}
                      />
                    )}
                    {(chartMode === 'both' ||
                      chartMode === 'expenses') && (
                      <Bar
                        dataKey="expenses"
                        fill="#f59e0b"
                        name="Expenses"
                        radius={[6, 6, 0, 0]}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* YTD summary card */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold mb-2 text-white">
                This year summary
              </h3>
              <p className="text-sm text-zinc-400 mb-4">
                Top-level view of sales and expenses for the year.
              </p>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">YTD Sales</span>
                <span className="font-semibold text-white">
                  ₦{ytdSales.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">
                  YTD Expenses
                </span>
                <span className="font-semibold text-amber-400">
                  ₦{ytdExpenses.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">YTD Net</span>
                <span
                  className="font-semibold"
                  style={{
                    color: ytdNet < 0 ? '#fb7185' : '#34d399',
                  }}
                >
                  ₦{ytdNet.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </OwnerFeatureGate>

      {/* Bottom: recent transactions + quick actions (free) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-zinc-800 rounded-xl p-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white">
                Recent Transactions
              </h3>
            </div>
            <button
              onClick={() => navigate('/sales')}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              View all
            </button>
          </div>

          <div className="space-y-3">
            {recentSales.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No sales recorded yet today.
              </p>
            ) : (
              recentSales.map((sale) => (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className="flex items-center justify-between bg-zinc-800/60 rounded-2xl px-4 py-3 cursor-pointer hover:bg-zinc-800"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {sale.receiptNo || sale.id}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {sale.createdAt
                        ? new Date(
                            sale.createdAt.toMillis()
                          ).toLocaleTimeString('en-NG', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Pending time'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-400">
                      ₦{(sale.total || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {sale.items ? sale.items.length : 0} item
                      {sale.items && sale.items.length > 1
                        ? 's'
                        : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-zinc-800 rounded-xl p-2">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white">
              Quick Actions
            </h3>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Things you do all the time in the shop.
          </p>
          <button
            onClick={() => navigate('/pos')}
            className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl mb-3 font-medium"
          >
            Open POS for new sale
          </button>
          <button
            onClick={() => navigate('/inventory')}
            className="w-full bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl mb-3 font-medium"
          >
            Add new product to inventory
          </button>
          <button
            onClick={() => navigate('/expenses')}
            className="w-full bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl text-sm text-zinc-300 mb-3"
          >
            Record today&apos;s expenses
          </button>
          <button
            onClick={() => navigate('/reports')}
            className="w-full bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl text-sm text-zinc-300"
          >
            View full reports
          </button>
        </div>
      </div>

      {/* Details drawer from recent transactions */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-end z-50">
          <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-zinc-500">
                  Receipt
                </p>
                <h2 className="text-xl font-semibold text-white">
                  {selectedSale.receiptNo || selectedSale.id}
                </h2>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-xs text-zinc-500">
                  Date / Time
                </p>
                <p className="text-sm text-white">
                  {selectedSale.createdAt
                    ? new Date(
                        selectedSale.createdAt.toMillis()
                      ).toLocaleString('en-NG')
                    : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">
                  Status
                </p>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold inline-block ${
                    (selectedSale.status || 'completed') ===
                    'voided'
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
                <p className="text-xs text-zinc-500">
                  Items
                </p>
                <p className="text-lg font-semibold text-white">
                  {(selectedSale.items || []).length}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Total</p>
                <p className="text-lg font-semibold text-emerald-400">
                  ₦
                  {(selectedSale.total || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">
                  Cashier
                </p>
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
                    <p className="text-sm text-white">
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.qty} × ₦
                      {(item.price || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold text-emerald-400">
                    ₦
                    {(
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
          </div>
        </div>
      )}
    </div>
  );
}