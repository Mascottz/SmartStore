// src/pages/Reports.jsx
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney } from '../lib/format';
import OwnerFeatureGate from '../components/OwnerFeatureGate';

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

const PIE_COLORS = ['#10b981', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Reports() {
  const { storeId } = useAuth();
  const [rangeDays, setRangeDays] = useState(7);

  const { data: sales } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );
  const { data: products } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );
  const { data: expenses } = useStoreData(
    () => (storeId ? api.expenses.list(storeId) : []),
    [storeId]
  );

  const rangeStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (rangeDays - 1));
    return d;
  }, [rangeDays]);

  const completedInRange = useMemo(
    () =>
      sales.filter(
        (s) => s.status === 'completed' && new Date(s.createdAt) >= rangeStart
      ),
    [sales, rangeStart]
  );

  const revenue = completedInRange.reduce((sum, s) => sum + s.total, 0);

  const costOfGoods = useMemo(() => {
    const costBySku = {};
    products.forEach((p) => (costBySku[p.id] = Number(p.costPrice || 0)));
    return completedInRange.reduce(
      (sum, s) =>
        sum + s.items.reduce((is, i) => is + (costBySku[i.productId] || 0) * i.qty, 0),
      0
    );
  }, [completedInRange, products]);

  const expensesInRange = useMemo(
    () =>
      expenses
        .filter((e) => new Date(e.date || e.createdAt) >= rangeStart)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [expenses, rangeStart]
  );

  const grossProfit = revenue - costOfGoods;
  const netProfit = grossProfit - expensesInRange;

  // Daily revenue series
  const dailyData = useMemo(() => {
    const days = [];
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      days.push({
        key: d.toDateString(),
        label: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
        revenue: 0,
      });
    }
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
    completedInRange.forEach((s) => {
      const key = new Date(s.createdAt).toDateString();
      if (byKey[key]) byKey[key].revenue += s.total;
    });
    return rangeDays > 30 ? days.filter((_, i) => i % 3 === 0) : days;
  }, [completedInRange, rangeStart, rangeDays]);

  // Top products
  const topProducts = useMemo(() => {
    const byName = {};
    completedInRange.forEach((s) =>
      s.items.forEach((i) => {
        byName[i.name] = byName[i.name] || { name: i.name, qty: 0, revenue: 0 };
        byName[i.name].qty += i.qty;
        byName[i.name].revenue += i.lineTotal;
      })
    );
    return Object.values(byName)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [completedInRange]);

  // Payment method breakdown
  const paymentData = useMemo(() => {
    const byMethod = {};
    completedInRange.forEach((s) => {
      byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + s.total;
    });
    return Object.entries(byMethod).map(([name, value]) => ({ name, value }));
  }, [completedInRange]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Reports</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Sales performance and profitability
          </p>
        </div>
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
          className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <OwnerFeatureGate label="Full reports are an Owner Mode feature">
        <div>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi label="Revenue" value={fmtMoney(revenue)} accent="text-emerald-500" />
            <Kpi label="Cost of Goods" value={fmtMoney(costOfGoods)} accent="text-zinc-500" />
            <Kpi label="Gross Profit" value={fmtMoney(grossProfit)} accent="text-sky-500" />
            <Kpi
              label="Net Profit (after expenses)"
              value={fmtMoney(netProfit)}
              accent={netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily revenue */}
            <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Daily revenue</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.3} />
                    <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
                    <YAxis
                      stroke="#71717a"
                      fontSize={11}
                      tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                    />
                    <Tooltip
                      formatter={(v) => [fmtMoney(v), 'Revenue']}
                      contentStyle={{
                        background: '#18181b',
                        border: '1px solid #3f3f46',
                        borderRadius: 12,
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Payment methods */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Payment methods</h3>
              {paymentData.length === 0 ? (
                <p className="text-xs text-zinc-500">No sales in this period.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                      >
                        {paymentData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => fmtMoney(v)}
                        contentStyle={{
                          background: '#18181b',
                          border: '1px solid #3f3f46',
                          borderRadius: 12,
                          color: '#fff',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Top products */}
          <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">Top sellers</h3>
            {topProducts.length === 0 ? (
              <p className="text-xs text-zinc-500">No sales in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Item</th>
                      <th className="py-2 pr-4 text-right">Qty sold</th>
                      <th className="py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.name} className="border-b border-zinc-100 dark:border-zinc-800/60">
                        <td className="py-2.5 pr-4 text-zinc-500">{i + 1}</td>
                        <td className="py-2.5 pr-4 font-medium">{p.name}</td>
                        <td className="py-2.5 pr-4 text-right">{p.qty}</td>
                        <td className="py-2.5 text-right font-semibold">{fmtMoney(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </OwnerFeatureGate>
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
      <p className={`text-xl font-bold truncate ${accent}`}>{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{label}</p>
    </div>
  );
}
