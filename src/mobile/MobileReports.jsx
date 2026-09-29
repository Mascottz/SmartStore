// src/mobile/MobileReports.jsx
// The owner's numbers on a phone: pick a range with a chip, then revenue,
// cost of goods, gross/net profit, the daily revenue chart, how customers
// paid and what sold the most. Mirrors the main Reports page.
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney } from '../lib/format';
import HelpTip from '../components/HelpTip';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

const METHOD_COLORS = {
  Cash: '#10b981',
  Transfer: '#0ea5e9',
  'POS/Card': '#f59e0b',
  Partial: '#8b5cf6',
  Credit: '#ec4899',
};

export default function MobileReports() {
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
      sales.filter((s) => s.status === 'completed' && new Date(s.createdAt) >= rangeStart),
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
      .slice(0, 6);
  }, [completedInRange]);

  const paymentBreakdown = useMemo(() => {
    const byMethod = {};
    completedInRange.forEach((s) => {
      byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + s.total;
    });
    const list = Object.entries(byMethod)
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);
    const max = list[0]?.total || 1;
    return { list, max };
  }, [completedInRange]);

  const fmtSigned = (n) => (n < 0 ? `-${fmtMoney(Math.abs(n))}` : fmtMoney(n));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          Reports
          <HelpTip
            label="Help: Reports (monitoring)"
            text="How the shop performed in the selected period: revenue, the cost of what was sold, gross profit, expenses and the net profit left over."
          />
        </h1>
        <div className="flex gap-1.5 mt-3">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRangeDays(r.value)}
              aria-pressed={rangeDays === r.value}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                rangeDays === r.value
                  ? 'bg-emerald-500 text-black'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Headline numbers */}
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-2.5">
        <Kpi label="Revenue" value={fmtMoney(revenue)} help="Completed sales in the period, before any costs." />
        <Kpi
          label="Cost of goods"
          value={fmtMoney(costOfGoods)}
          help="What the sold items cost the shop, using each product's cost price."
        />
        <Kpi
          label="Gross profit"
          value={fmtSigned(grossProfit)}
          accent={grossProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}
          help="Revenue minus the cost of the goods sold."
        />
        <Kpi
          label="Net profit"
          value={fmtSigned(netProfit)}
          accent={netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}
          help="Gross profit minus expenses recorded in the period. The number that says if the shop is truly making money."
        />
        <Kpi
          label="Receipts"
          value={completedInRange.length}
          help="Completed sales in the period."
        />
        <Kpi
          label="Expenses"
          value={fmtMoney(expensesInRange)}
          accent="text-amber-600 dark:text-amber-400"
          help="Everything recorded on the Expenses page in the period."
        />
      </section>

      {/* Daily revenue */}
      <section
        aria-label="Daily revenue"
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
      >
        <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          Daily revenue
          <HelpTip
            label="Help: Daily revenue"
            text="Completed sales grouped by day across the selected period. Tap a bar for the exact figure."
          />
        </h2>
        <div className="h-44 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                stroke="#a1a1aa"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#a1a1aa"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              />
              <Tooltip
                formatter={(v) => [fmtMoney(v), 'Revenue']}
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Payment methods */}
      {paymentBreakdown.list.length > 0 && (
        <section
          aria-label="Payment methods"
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
        >
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            How customers paid
            <HelpTip
              label="Help: Payment methods"
              text="Revenue in the period split by payment method: Cash, Transfer, POS/Card, Partial and Credit."
            />
          </h2>
          <div className="space-y-2.5">
            {paymentBreakdown.list.map(({ method, total }) => (
              <div key={method}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold">{method}</span>
                  <span className="text-zinc-500">
                    {fmtMoney(total)} · {revenue > 0 ? Math.round((total / revenue) * 100) : 0}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(3, (total / paymentBreakdown.max) * 100)}%`,
                      background: METHOD_COLORS[method] || '#71717a',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top products */}
      {topProducts.length > 0 && (
        <section
          aria-label="Top products"
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
        >
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            Top sellers
            <HelpTip
              label="Help: Top sellers"
              text="The products that brought in the most money in the period."
            />
          </h2>
          <div className="space-y-2.5">
            {topProducts.map((p, idx) => (
              <div key={p.name} className="flex items-center gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 min-w-0 truncate">{p.name}</span>
                <span className="text-[11px] text-zinc-500 shrink-0">×{p.qty}</span>
                <span className="font-semibold shrink-0">{fmtMoney(p.revenue)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, help }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5">
      <p className={`text-base font-bold truncate ${accent || ''}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
        <span className="truncate">{label}</span>
        {help && <HelpTip label={`Help: ${label}`} text={help} />}
      </p>
    </div>
  );
}
