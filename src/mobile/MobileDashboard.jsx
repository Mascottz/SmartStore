// src/mobile/MobileDashboard.jsx
// The monitoring home: a phone-first snapshot of the shop. Today's money,
// the week and month so far, who owes what, what is running low and the most
// recent receipts. No POS, no checkout — just the picture.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookUser,
  ChevronRight,
  Package,
  Receipt as ReceiptIcon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
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
import { fmtMoney, startOfToday } from '../lib/format';
import { saleBalance } from '../lib/credit';
import HelpTip from '../components/HelpTip';

const LOW_STOCK_THRESHOLD = 50;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function MobileDashboard() {
  const navigate = useNavigate();
  const { storeId, storeName, niche, firstSaleCompleted } = useAuth();

  const { data: sales } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );
  const { data: products } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );

  const completed = useMemo(
    () => sales.filter((s) => s.status === 'completed'),
    [sales]
  );

  const dayStart = (offsetDays = 0) => {
    const d = startOfToday();
    d.setDate(d.getDate() - offsetDays);
    return d;
  };

  const todaySales = useMemo(
    () => completed.filter((s) => new Date(s.createdAt) >= dayStart(0)),
    [completed]
  );
  const yesterdaySales = useMemo(
    () =>
      completed.filter((s) => {
        const t = new Date(s.createdAt);
        return t >= dayStart(1) && t < dayStart(0);
      }),
    [completed]
  );
  const weekSales = useMemo(
    () => completed.filter((s) => new Date(s.createdAt) >= dayStart(6)),
    [completed]
  );
  const monthSales = useMemo(
    () => completed.filter((s) => new Date(s.createdAt) >= dayStart(29)),
    [completed]
  );

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
  const weekRevenue = weekSales.reduce((sum, s) => sum + s.total, 0);
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.total, 0);

  // Compared with yesterday: up/down/flat, guarded against a zero base.
  const deltaPct =
    yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : todayRevenue > 0
        ? 100
        : 0;
  const DeltaIcon = deltaPct >= 0 ? TrendingUp : TrendingDown;

  const outstanding = useMemo(
    () => completed.filter((s) => saleBalance(s) > 0),
    [completed]
  );
  const outstandingTotal = outstanding.reduce((sum, s) => sum + saleBalance(s), 0);

  const lowStockItems = useMemo(
    () =>
      niche.trackStock
        ? products
            .filter((p) => (p.stock || 0) < LOW_STOCK_THRESHOLD)
            .sort((a, b) => (a.stock || 0) - (b.stock || 0))
        : [],
    [products, niche.trackStock]
  );
  const outOfStockCount = lowStockItems.filter((p) => !p.stock).length;

  // Revenue for each of the last 7 days.
  const weekChart = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const start = dayStart(i);
      const end = dayStart(i - 1);
      const revenue = completed
        .filter((s) => {
          const t = new Date(s.createdAt);
          return t >= start && t < end;
        })
        .reduce((sum, s) => sum + s.total, 0);
      days.push({
        label: start.toLocaleDateString('en-NG', { weekday: 'short' }),
        revenue,
      });
    }
    return days;
  }, [completed]);

  const recent = completed.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold">
          {greeting()}, {storeName || 'Owner'}
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {new Date().toLocaleDateString('en-NG', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
          {' · '}
          <span className="text-emerald-600 dark:text-emerald-400">
            Monitoring mode
          </span>
        </p>
      </div>

      {/* First-sale nudge (no POS link: the owner is monitoring) */}
      {!firstSaleCompleted && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Waiting for the first sale
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Your team can ring it up on the POS register at the counter. It will
            show up here the moment it happens.
          </p>
        </div>
      )}

      {/* Today hero */}
      <section
        aria-label="Today at a glance"
        className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white p-5 shadow-lg shadow-emerald-600/20"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
            Today&apos;s revenue
          </p>
          {yesterdayRevenue > 0 && (
            <span
              className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                deltaPct >= 0 ? 'bg-white/20' : 'bg-black/20'
              }`}
            >
              <DeltaIcon className="w-3 h-3" aria-hidden="true" />
              {Math.abs(deltaPct).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-4xl font-bold mt-2 tracking-tight">{fmtMoney(todayRevenue)}</p>
        <p className="text-xs text-emerald-100 mt-2">
          {todaySales.length} receipt{todaySales.length !== 1 ? 's' : ''} today
          {yesterdayRevenue > 0 && (
            <> · yesterday {fmtMoney(yesterdayRevenue)}</>
          )}
        </p>
      </section>

      {/* Quick stats */}
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3">
        <StatTile
          label="This week"
          value={fmtMoney(weekRevenue)}
          hint="Completed sales in the last 7 days"
          onClick={() => navigate('/m/reports')}
        />
        <StatTile
          label="This month"
          value={fmtMoney(monthRevenue)}
          hint="Completed sales in the last 30 days"
          onClick={() => navigate('/m/reports')}
        />
        <StatTile
          label="Credit outstanding"
          value={fmtMoney(outstandingTotal)}
          accent="text-amber-600 dark:text-amber-400"
          hint={`${outstanding.length} open debt${outstanding.length !== 1 ? 's' : ''} in the Credit Book`}
          onClick={() => navigate('/m/credit')}
        />
        <StatTile
          label={niche.trackStock ? 'Low stock' : 'Catalogue'}
          value={
            niche.trackStock
              ? `${lowStockItems.length}${outOfStockCount ? ` · ${outOfStockCount} out` : ''}`
              : `${products.length}`
          }
          accent="text-sky-500"
          hint={
            niche.trackStock
              ? `Fewer than ${LOW_STOCK_THRESHOLD} units on the shelf`
              : 'Items in the catalogue'
          }
          onClick={() => navigate('/m/inventory')}
        />
      </section>

      {/* 7-day chart */}
      <section
        aria-label="Revenue, last 7 days"
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
      >
        <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          Revenue, last 7 days
          <HelpTip
            label="Help: Revenue, last 7 days"
            text="Completed sales grouped by day. Tap a bar to see that day's exact revenue."
          />
        </h2>
        <div className="h-40 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
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

      {/* Low stock */}
      {niche.trackStock && (
        <ListCard
          title={`Low stock (${lowStockItems.length})`}
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
          help={`Everything with fewer than ${LOW_STOCK_THRESHOLD} units on the shelf, the emptiest first.`}
          emptyText="All stock levels look healthy."
          onMore={() => navigate('/m/inventory')}
          items={lowStockItems.slice(0, 5).map((p) => ({
            id: p.id,
            left: p.name,
            right: (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  p.stock
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-red-500/10 text-red-500'
                }`}
              >
                {p.stock ? `${p.stock} left` : 'Out'}
              </span>
            ),
          }))}
        />
      )}

      {/* Recent receipts */}
      <ListCard
        title="Recent receipts"
        icon={<ReceiptIcon className="w-4 h-4 text-emerald-500" />}
        help="The five most recent completed receipts. Open the Sales tab for the full history."
        emptyText="No sales yet."
        onMore={() => navigate('/m/sales')}
        items={recent.map((s) => ({
          id: s.id,
          left: (
            <span className="min-w-0">
              <span className="font-semibold text-sm">{s.receiptNo}</span>
              <span className="block text-[11px] text-zinc-500 truncate">
                {new Date(s.createdAt).toLocaleTimeString('en-NG', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {s.paymentMethod}
                {s.customerName ? ` · ${s.customerName}` : ''}
              </span>
            </span>
          ),
          right: (
            <span
              className={`text-sm font-bold shrink-0 ${
                s.status === 'voided' ? 'line-through text-zinc-400' : ''
              }`}
            >
              {fmtMoney(s.total)}
            </span>
          ),
        }))}
      />

      {/* Credit shortcut when there are debts */}
      {outstanding.length > 0 && (
        <button
          onClick={() => navigate('/m/credit')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-left"
        >
          <BookUser className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">
              {fmtMoney(outstandingTotal)} is owed to the shop
            </span>
            <span className="block text-xs text-zinc-500">
              {outstanding.length} open debt{outstanding.length !== 1 ? 's' : ''} · Credit Book
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
        </button>
      )}

      {/* Inventory shortcut for non-tracking niches */}
      {!niche.trackStock && (
        <button
          onClick={() => navigate('/m/inventory')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 text-left"
        >
          <Package className="w-5 h-5 text-sky-500 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">
              {products.length} {niche.itemNounPlural.toLowerCase()} in the catalogue
            </span>
            <span className="block text-xs text-zinc-500">Browse and manage stock</span>
          </span>
          <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function StatTile({ label, value, hint, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 active:scale-[0.98] transition-transform"
    >
      <p className={`text-lg font-bold truncate ${accent || ''}`}>{value}</p>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
        <span className="truncate">{label}</span>
        <HelpTip label={`Help: ${label}`} text={hint} />
      </p>
    </button>
  );
}

function ListCard({ title, icon, help, items, emptyText, onMore }) {
  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
        {icon}
        {title}
        {help && <HelpTip label={`Help: ${title}`} text={help} />}
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">{emptyText}</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{item.left}</span>
              {item.right}
            </div>
          ))}
        </div>
      )}
      {onMore && (
        <button
          onClick={onMore}
          className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
        >
          View all →
        </button>
      )}
    </section>
  );
}
