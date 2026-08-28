// src/pages/Dashboard.jsx
import { useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Receipt,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney, startOfToday, monthKey, monthLabelFromKey } from '../lib/format';
import OwnerFeatureGate from '../components/OwnerFeatureGate';
import HelpTip from '../components/HelpTip';

const LOW_STOCK_THRESHOLD = 50;

export default function Dashboard() {
  const navigate = useNavigate();
  const { storeId, storeName, niche, firstSaleCompleted } = useAuth();

  const { data: sales, loading: salesLoading } = useStoreData(
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

  const completedSales = useMemo(
    () => sales.filter((s) => s.status === 'completed'),
    [sales]
  );

  const todaySales = useMemo(() => {
    const start = startOfToday();
    return completedSales.filter((s) => new Date(s.createdAt) >= start);
  }, [completedSales]);

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const totalRevenue = completedSales.reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const lowStockItems = useMemo(
    () =>
      niche.trackStock
        ? products.filter((p) => (p.stock || 0) < LOW_STOCK_THRESHOLD)
        : [],
    [products, niche.trackStock]
  );

  // Monthly revenue for the last 6 months
  const monthlyData = useMemo(() => {
    const byMonth = {};
    completedSales.forEach((s) => {
      const key = monthKey(s.createdAt);
      byMonth[key] = (byMonth[key] || 0) + s.total;
    });
    const keys = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const k = monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1));
      keys.push(k);
    }
    return keys.map((k) => ({
      month: monthLabelFromKey(k),
      revenue: byMonth[k] || 0,
    }));
  }, [completedSales]);

  const stats = [
    {
      label: "Today's Sales",
      value: todaySales.length,
      icon: Receipt,
      accent: 'text-emerald-500',
      help: 'How many receipts were completed since midnight. Voided sales are not counted.',
    },
    {
      label: "Today's Revenue",
      value: fmtMoney(todayRevenue),
      icon: DollarSign,
      accent: 'text-emerald-500',
      help: 'Money taken in today from completed sales, before costs and expenses are deducted.',
    },
    {
      label: 'Total Revenue',
      value: fmtMoney(totalRevenue),
      icon: TrendingUp,
      accent: 'text-sky-500',
      gated: true,
      help: 'Every completed sale since the store opened. Owner Mode plan card — on other plans it stays blurred with an upgrade prompt.',
    },
    {
      label: 'Total Expenses',
      value: fmtMoney(totalExpenses),
      icon: ShoppingBag,
      accent: 'text-amber-500',
      gated: true,
      help: 'Everything recorded on the Expenses page. Owner Mode plan card — on other plans it stays blurred with an upgrade prompt.',
    },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <HelpTip
            label="Help: Dashboard"
            iconClassName="w-7 h-7"
            text="A live snapshot of the store: today's sales and revenue, the six-month revenue trend, items running low and the most recent receipts. Cards marked with a lock need the Owner Mode plan."
          />
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          {storeName}, here&apos;s how your business is doing.
        </p>
      </div>

      {/* Getting started card */}
      {!firstSaleCompleted && !salesLoading && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-emerald-600 dark:text-emerald-400">
              Get your first sale in
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              {products.length === 0
                ? `Start by adding your first ${niche.itemNoun.toLowerCase()}, then ring up a sale at the POS.`
                : 'Your items are in; head to the POS Register and complete your first sale.'}
            </p>
          </div>
          <button
            onClick={() => navigate(products.length === 0 ? '/inventory' : '/pos')}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400"
          >
            {products.length === 0 ? `Add ${niche.itemNoun}` : 'Open POS'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const card = (
            <div
              key={stat.label}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-5 h-5 ${stat.accent}`} />
              </div>
              <p className="text-xl md:text-2xl font-bold truncate">{stat.value}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {stat.label}
                {stat.help && (
                  <HelpTip
                    className="ml-1"
                    label={`Help: ${stat.label}`}
                    text={stat.help}
                  />
                )}
              </p>
            </div>
          );
          return stat.gated ? (
            <OwnerFeatureGate key={stat.label} label={stat.label}>
              {card}
            </OwnerFeatureGate>
          ) : (
            card
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-2">
          <OwnerFeatureGate label="Monthly revenue chart">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-1.5">
                Revenue, last 6 months
                <HelpTip
                  label="Help: Revenue, last 6 months"
                  text="Completed sales grouped by calendar month. Hover or tap a bar to see that month's exact revenue."
                />
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" opacity={0.3} />
                    <XAxis dataKey="month" stroke="#71717a" fontSize={12} />
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
          </OwnerFeatureGate>
        </div>

        {/* Low stock / recent sales */}
        <div className="space-y-6">
          {niche.trackStock && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-sm">Low Stock ({lowStockItems.length})</h3>
                <HelpTip
                  label="Help: Low Stock"
                  text={`Everything with fewer than ${LOW_STOCK_THRESHOLD} units on the shelf. Restock from the Inventory page before these run out — the badge shows how many units are left.`}
                />
              </div>
              {lowStockItems.length === 0 ? (
                <p className="text-xs text-zinc-500">All stock levels look healthy.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {lowStockItems.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="truncate mr-2">{p.name}</span>
                      <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        {p.stock} left
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => navigate('/inventory')}
                className="mt-3 text-xs text-emerald-500 hover:underline"
              >
                Manage inventory →
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
              Recent Sales
              <HelpTip
                label="Help: Recent Sales"
                text="The six most recent completed receipts. Open Sales History to search every receipt, reprint one or void a sale."
              />
            </h3>
            {completedSales.length === 0 ? (
              <p className="text-xs text-zinc-500">No sales yet today.</p>
            ) : (
              <div className="space-y-2">
                {completedSales.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500 text-xs">{s.receiptNo}</span>
                    <span className="font-semibold">{fmtMoney(s.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => navigate('/sales')}
              className="mt-3 text-xs text-emerald-500 hover:underline"
            >
              View all sales →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
