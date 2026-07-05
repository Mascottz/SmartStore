// src/pages/ExpensesReport.jsx
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, PieChart as PieIcon, BarChart3 } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import OwnerFeatureGate from '../components/OwnerFeatureGate'; // ✅ NEW

const CHART_COLORS = [
  '#22c55e',
  '#fbbf24',
  '#38bdf8',
  '#a855f7',
  '#fb7185',
  '#f97316',
  '#2dd4bf',
  '#e5e7eb',
];

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts.toMillis());
  return d.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatMonthKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-NG', {
    month: 'short',
    year: 'numeric',
  });
};

export default function ExpensesReport() {
  const { storeId } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!storeId) return;

    const q = query(
      collection(db, 'expenses'),
      where('storeId', '==', storeId),
      orderBy('date', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setExpenses(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (!exp.date) return false;
      const d = exp.date.toDate ? exp.date.toDate() : new Date(exp.date);

      if (startDate) {
        const s = new Date(startDate);
        if (d < s) return false;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        if (d > e) return false;
      }
      return true;
    });
  }, [expenses, startDate, endDate]);

  const total = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    [filteredExpenses]
  );

  const totalsByCategory = useMemo(() => {
    const map = {};
    filteredExpenses.forEach((e) => {
      const cat = e.category || 'Other';
      map[cat] = (map[cat] || 0) + (e.amount || 0);
    });
    return map;
  }, [filteredExpenses]);

  const totalsByMonth = useMemo(() => {
    const map = {};
    filteredExpenses.forEach((e) => {
      if (!e.date) return;
      const d = e.date.toDate ? e.date.toDate() : new Date(e.date);
      const key = formatMonthKey(d);
      map[key] = (map[key] || 0) + (e.amount || 0);
    });
    return map;
  }, [filteredExpenses]);

  const sortedCategoryEntries = useMemo(
    () =>
      Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1]),
    [totalsByCategory]
  );

  const sortedMonthEntries = useMemo(
    () =>
      Object.entries(totalsByMonth).sort((a, b) =>
        a[0].localeCompare(b[0])
      ),
    [totalsByMonth]
  );

  const pieData = sortedCategoryEntries.map(([name, value]) => ({
    name,
    value,
  }));

  const barData = sortedMonthEntries.map(([key, value]) => ({
    month: monthLabel(key),
    total: value,
  }));

  return (
    <OwnerFeatureGate>
      <div className="p-8 bg-zinc-950 min-h-screen">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">Expenses Report</h1>
            <p className="text-zinc-400">
              Visualise where your money is going by category and by month.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Total (filtered)</p>
            <p className="text-xl font-semibold text-amber-400">
              ₦{total.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-zinc-800 rounded-xl p-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white">Filters</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                End date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-2xl text-sm text-zinc-100"
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Pie chart by category */}
          <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-zinc-800 rounded-xl p-2">
                  <PieIcon className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-white">
                  Expenses by category
                </h3>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : pieData.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No expenses in this period.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius="80%"
                      paddingAngle={3}
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={
                            CHART_COLORS[index % CHART_COLORS.length]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `₦${Number(value).toLocaleString()}`,
                        name,
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Bar chart by month */}
          <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-zinc-800 rounded-xl p-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-white">
                  Monthly expenses
                </h3>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : barData.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No expenses in this period.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="month"
                      stroke="#a1a1aa"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#a1a1aa"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `₦${v.toLocaleString()}`}
                    />
                    <Tooltip
                      formatter={(value) =>
                        `₦${Number(value).toLocaleString()}`
                      }
                    />
                    <Legend />
                    <Bar
                      dataKey="total"
                      fill="#22c55e"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By category table */}
          <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800">
            <h3 className="font-semibold text-white mb-4">
              Category breakdown
            </h3>

            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : sortedCategoryEntries.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No expenses in this period.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 text-left">CATEGORY</th>
                    <th className="py-2 text-right">TOTAL</th>
                    <th className="py-2 text-right">% OF TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCategoryEntries.map(([cat, value]) => (
                    <tr
                      key={cat}
                      className="border-b border-zinc-800 last:border-0"
                    >
                      <td className="py-2 text-zinc-200">{cat}</td>
                      <td className="py-2 text-right text-amber-400">
                        ₦{value.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-zinc-400">
                        {total > 0
                          ? ((value / total) * 100).toFixed(1) + '%'
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Monthly table */}
          <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800">
            <h3 className="font-semibold text-white mb-4">
              Monthly breakdown
            </h3>

            {loading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : sortedMonthEntries.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No expenses in this period.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 text-left">MONTH</th>
                    <th className="py-2 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMonthEntries.map(([key, value]) => (
                    <tr
                      key={key}
                      className="border-b border-zinc-800 last:border-0"
                    >
                      <td className="py-2 text-zinc-200">
                        {monthLabel(key)}
                      </td>
                      <td className="py-2 text-right text-amber-400">
                        ₦{value.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Raw list */}
        <div className="mt-8 bg-zinc-900 rounded-3xl p-5 border border-zinc-800">
          <h3 className="font-semibold text-white mb-4">
            Expenses in period
          </h3>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : filteredExpenses.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No expenses match the selected period.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 text-zinc-400">
                <tr>
                  <th className="py-2 text-left">DATE</th>
                  <th className="py-2 text-left">DESCRIPTION</th>
                  <th className="py-2 text-left">CATEGORY</th>
                  <th className="py-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="border-b border-zinc-800 last:border-0"
                  >
                    <td className="py-2 text-zinc-300">
                      {formatDate(exp.date)}
                    </td>
                    <td className="py-2 text-zinc-100">
                      {exp.description}
                    </td>
                    <td className="py-2 text-zinc-400">
                      {exp.category || 'Other'}
                    </td>
                    <td className="py-2 text-right text-amber-400">
                      ₦{(exp.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </OwnerFeatureGate>
  );
}