// src/pages/ExpensesReport.jsx
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney, monthKey, monthLabelFromKey } from '../lib/format';
import OwnerFeatureGate from '../components/OwnerFeatureGate';

const PIE_COLORS = ['#f59e0b', '#10b981', '#0ea5e9', '#ef4444', '#8b5cf6', '#ec4899', '#84cc16', '#64748b'];

const RANGES = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last 12 months' },
];

export default function ExpensesReport() {
  const { storeId } = useAuth();
  const [rangeDays, setRangeDays] = useState(30);

  const { data: expenses } = useStoreData(
    () => (storeId ? api.expenses.list(storeId) : []),
    [storeId]
  );
  const { data: sales } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );

  const rangeStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (rangeDays - 1));
    return d;
  }, [rangeDays]);

  const inRange = useMemo(
    () => expenses.filter((e) => new Date(e.date || e.createdAt) >= rangeStart),
    [expenses, rangeStart]
  );

  const totalExpenses = inRange.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const revenueInRange = useMemo(
    () =>
      sales
        .filter((s) => s.status === 'completed' && new Date(s.createdAt) >= rangeStart)
        .reduce((sum, s) => sum + s.total, 0),
    [sales, rangeStart]
  );

  const byCategory = useMemo(() => {
    const map = {};
    inRange.forEach((e) => {
      map[e.category || 'Other'] = (map[e.category || 'Other'] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [inRange]);

  const byMonth = useMemo(() => {
    const map = {};
    inRange.forEach((e) => {
      const key = monthKey(e.date || e.createdAt);
      map[key] = (map[key] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, amount]) => ({ month: monthLabelFromKey(key), amount }));
  }, [inRange]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Expenses Report</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Where your money goes
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

      <OwnerFeatureGate label="Expense analytics are an Owner Mode feature">
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Kpi label="Total expenses" value={fmtMoney(totalExpenses)} accent="text-amber-500" />
            <Kpi label="Revenue (same period)" value={fmtMoney(revenueInRange)} accent="text-emerald-500" />
            <Kpi
              label="Expenses as % of revenue"
              value={revenueInRange > 0 ? `${Math.round((totalExpenses / revenueInRange) * 100)}%` : '-'}
              accent="text-sky-500"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <h3 className="font-semibold mb-4">By category</h3>
              {byCategory.length === 0 ? (
                <p className="text-xs text-zinc-500">No expenses in this period.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={3}
                      >
                        {byCategory.map((_, i) => (
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

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <h3 className="font-semibold mb-4">By month</h3>
              {byMonth.length === 0 ? (
                <p className="text-xs text-zinc-500">No expenses in this period.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.3} />
                      <XAxis dataKey="month" stroke="#71717a" fontSize={12} />
                      <YAxis
                        stroke="#71717a"
                        fontSize={11}
                        tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                      />
                      <Tooltip
                        formatter={(v) => [fmtMoney(v), 'Expenses']}
                        contentStyle={{
                          background: '#18181b',
                          border: '1px solid #3f3f46',
                          borderRadius: 12,
                          color: '#fff',
                        }}
                      />
                      <Bar dataKey="amount" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Breakdown table */}
          <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">Category breakdown</h3>
            <div className="space-y-3">
              {byCategory.map((c, i) => (
                <div key={c.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{c.name}</span>
                    <span className="font-semibold">{fmtMoney(c.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${totalExpenses ? (c.value / totalExpenses) * 100 : 0}%`,
                        background: PIE_COLORS[i % PIE_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
              {byCategory.length === 0 && (
                <p className="text-xs text-zinc-500">Nothing to show yet.</p>
              )}
            </div>
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
