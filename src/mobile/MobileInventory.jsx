// src/mobile/MobileInventory.jsx
// The owner's stock, built for a phone: chips instead of dropdowns, one card
// per item with a colour-coded stock badge, and a tap to expand the numbers
// that matter (cost, margin, expiry). Search sticks to the top while the
// list scrolls. Add/edit opens as a bottom sheet on phones.
//
// This mirrors the full Inventory page minus nothing; monitoring mode keeps
// stock management, it just never sells.
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';
import { sanitize, isValidItemName } from '../lib/validate';
import { generateSku } from '../lib/sku';
import { downloadCsv } from '../lib/exportCsv';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const LOW_STOCK_THRESHOLD = 50;

const fmtSignedMoney = (n) => (n < 0 ? `-${fmtMoney(Math.abs(n))}` : fmtMoney(n));

const emptyForm = {
  name: '',
  sku: '',
  category: '',
  costPrice: '',
  salePrice: '',
  stock: '',
  expiryDate: '',
};

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];

export default function MobileInventory() {
  const { storeId, niche, store } = useAuth();

  const { data: products, loading } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );
  const { data: categories } = useStoreData(
    () => (storeId ? api.categories.list(storeId) : []),
    [storeId]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [expandedId, setExpandedId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 200);

  const lowStockCount = useMemo(
    () =>
      niche.trackStock
        ? products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) < LOW_STOCK_THRESHOLD).length
        : 0,
    [products, niche.trackStock]
  );
  const outOfStockCount = useMemo(
    () => (niche.trackStock ? products.filter((p) => !p.stock).length : 0),
    [products, niche.trackStock]
  );

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    const list = products.filter((p) => {
      if (
        term &&
        !p.name.toLowerCase().includes(term) &&
        !(p.sku || '').toLowerCase().includes(term) &&
        !(p.category || '').toLowerCase().includes(term)
      ) {
        return false;
      }
      if (categoryFilter !== 'all' && (p.category || 'General') !== categoryFilter) return false;
      if (niche.trackStock) {
        // "Low stock" is everything needing a restock, zero included; the
        // "Out of stock" chip narrows to items that have completely run out.
        if (statusFilter === 'low' && !((p.stock || 0) < LOW_STOCK_THRESHOLD)) return false;
        if (statusFilter === 'out' && (p.stock || 0) > 0) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'stock') return (a.stock || 0) - (b.stock || 0);
      if (sortBy === 'price') return (b.salePrice || 0) - (a.salePrice || 0);
      return a.name.localeCompare(b.name);
    });
  }, [products, debouncedSearch, statusFilter, categoryFilter, sortBy, niche.trackStock]);

  // Whole-catalogue worth of the shelves (never the filtered subset).
  const valuation = useMemo(() => {
    let costValue = 0;
    let retailValue = 0;
    let units = 0;
    products.forEach((p) => {
      const qty = Math.max(0, Number(p.stock) || 0);
      costValue += (Number(p.costPrice) || 0) * qty;
      retailValue += (Number(p.salePrice) || 0) * qty;
      units += qty;
    });
    const profit = retailValue - costValue;
    const marginPct = retailValue > 0 ? (profit / retailValue) * 100 : 0;
    return { costValue, retailValue, profit, marginPct, units };
  }, [products]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku || '',
      category: p.category || '',
      costPrice: String(p.costPrice ?? ''),
      salePrice: String(p.salePrice ?? ''),
      stock: String(p.stock ?? ''),
      expiryDate: p.expiryDate || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const cleanName = sanitize(form.name);
    if (!isValidItemName(cleanName)) {
      return toast.error(`${niche.itemNoun} name is required (1 to 200 characters).`);
    }
    const costPrice = Number(form.costPrice);
    const salePrice = Number(form.salePrice);
    if (salePrice <= 0) return toast.error('Selling price must be greater than zero.');
    if (costPrice < 0) return toast.error('Cost price cannot be negative.');

    setSaving(true);
    try {
      const manualSku = sanitize(form.sku);
      const autoSku = !manualSku;
      const sku = manualSku || generateSku(cleanName, products.map((p) => p.sku));
      const payload = {
        name: cleanName,
        sku,
        category: sanitize(form.category) || 'General',
        costPrice,
        salePrice,
        stock: niche.trackStock ? Math.max(0, Math.floor(Number(form.stock) || 0)) : 0,
        expiryDate: niche.hasExpiry && form.expiryDate ? form.expiryDate : null,
      };
      if (editingId) {
        await api.products.update(editingId, payload);
        toast.success(autoSku ? `${niche.itemNoun} updated, SKU ${sku}` : `${niche.itemNoun} updated`);
      } else {
        await api.products.create(storeId, payload);
        if (!store?.onboarding?.firstProductAdded) {
          await api.stores.update(storeId, { onboarding: { firstProductAdded: true } });
        }
        toast.success(autoSku ? `${niche.itemNoun} added, SKU ${sku}` : `${niche.itemNoun} added`);
      }
      setShowModal(false);
    } catch (e) {
      toast.error(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.products.remove(deleteTarget.id);
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message || 'Could not delete.');
    }
    setDeleteTarget(null);
  };

  const isExpiringSoon = (p) => {
    if (!p.expiryDate) return false;
    const days = (new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
    return days < 90;
  };

  const handleExport = () => {
    const headers = niche.trackStock
      ? ['Name', 'SKU', 'Category', 'Cost Price', 'Selling Price', 'Stock']
      : ['Name', 'SKU', 'Category', 'Cost Price', 'Selling Price'];
    const rows = products.map((p) =>
      niche.trackStock
        ? [p.name, p.sku, p.category, p.costPrice, p.salePrice, p.stock]
        : [p.name, p.sku, p.category, p.costPrice, p.salePrice]
    );
    downloadCsv(`${store?.name || 'inventory'}-export`, headers, rows);
    toast.success('Exported to CSV');
  };

  const title = niche.itemNounPlural === 'Products' ? 'Inventory' : niche.itemNounPlural;

  return (
    <div>
      {/* Heading */}
      <div className="mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          {title}
          <HelpTip
            label="Help: Inventory (monitoring)"
            text={`Everything on your shelves. Stock badges turn amber below ${LOW_STOCK_THRESHOLD} units and red at zero. Tap an item for its cost, margin and expiry, or use the + button to add stock.`}
          />
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {products.length} {niche.itemNounPlural.toLowerCase()}
          {niche.trackStock && <> · {valuation.units.toLocaleString('en-NG')} units</>}
          {lowStockCount > 0 && <span className="text-amber-500"> · {lowStockCount} low</span>}
          {outOfStockCount > 0 && <span className="text-red-500"> · {outOfStockCount} out</span>}
        </p>
      </div>

      {/* Shelf worth summary: the whole catalogue, not the filtered list */}
      {niche.trackStock && products.length > 0 && (
        <section
          aria-label="Inventory worth summary"
          className="grid grid-cols-2 gap-2.5 mb-4"
        >
          <WorthTile
            icon={Wallet}
            accent="text-sky-500"
            label="Stock at cost"
            value={fmtMoney(valuation.costValue)}
            help="What every unit currently in stock cost you. Covers the whole catalogue, even while the list below is filtered."
          />
          <WorthTile
            icon={Tag}
            accent="text-emerald-500"
            label="Retail value"
            value={fmtMoney(valuation.retailValue)}
            help="What the shelves are worth at the till if every unit sells at its current price."
          />
          <WorthTile
            icon={TrendingUp}
            accent={valuation.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}
            tone={valuation.profit >= 0 ? 'positive' : 'negative'}
            label="Potential profit"
            value={fmtSignedMoney(valuation.profit)}
            badge={`${valuation.marginPct.toFixed(1)}% margin`}
            help="Retail value minus cost. The margin is that profit as a percentage of what the stock would sell for."
          />
          <WorthTile
            icon={Plus}
            accent="text-zinc-400"
            label="Units on hand"
            value={valuation.units.toLocaleString('en-NG')}
            help="Total units currently in stock across the whole catalogue."
          />
        </section>
      )}

      {/* Sticky search + filters */}
      <div className="sticky top-[61px] z-20 -mx-4 px-4 py-2 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Name, SKU or category…"
            aria-label={`Search ${niche.itemNounPlural.toLowerCase()}`}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
          {niche.trackStock &&
            STATUS_FILTERS.map((f) => (
              <Chip
                key={f.value}
                active={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Chip>
            ))}
          {categories.map((c) => (
            <Chip
              key={c.id}
              active={categoryFilter === c.name}
              onClick={() => setCategoryFilter(categoryFilter === c.name ? 'all' : c.name)}
            >
              {c.name}
            </Chip>
          ))}
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <Chip active={sortBy === 'name'} onClick={() => setSortBy('name')}>A-Z</Chip>
            {niche.trackStock && (
              <Chip active={sortBy === 'stock'} onClick={() => setSortBy('stock')}>
                Lowest stock
              </Chip>
            )}
            <Chip active={sortBy === 'price'} onClick={() => setSortBy('price')}>
              Priciest
            </Chip>
          </div>
          {products.length > 0 && (
            <button
              onClick={handleExport}
              className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-emerald-500 px-2 py-1"
              aria-label="Export inventory to CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
        </div>
      </div>

      {/* Product cards */}
      <div className="mt-4 space-y-2.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl h-[74px]"
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-sm text-zinc-500">
              {debouncedSearch || statusFilter !== 'all' || categoryFilter !== 'all'
                ? `No ${niche.itemNounPlural.toLowerCase()} match those filters.`
                : `No ${niche.itemNounPlural.toLowerCase()} yet. Tap + to add your first one.`}
            </p>
          </div>
        ) : (
          filtered.map((p) => {
            const expanded = expandedId === p.id;
            const stock = p.stock ?? 0;
            const stockTone = !stock
              ? 'bg-red-500/10 text-red-500'
              : stock < LOW_STOCK_THRESHOLD
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
            const unitMargin = (Number(p.salePrice) || 0) - (Number(p.costPrice) || 0);

            return (
              <div
                key={p.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  aria-expanded={expanded}
                  className="w-full text-left p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm leading-snug">{p.name}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {p.category || 'General'}
                        {p.sku ? ` · ${p.sku}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-bold shrink-0">{fmtMoney(p.salePrice)}</p>
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {niche.trackStock && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stockTone}`}>
                        {stock
                          ? stock < LOW_STOCK_THRESHOLD
                            ? `${stock} left`
                            : `${stock} in stock`
                          : 'Out of stock'}
                      </span>
                    )}
                    {niche.hasExpiry && p.expiryDate && isExpiringSoon(p) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> {fmtDate(p.expiryDate)}
                      </span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="px-3.5 pb-3.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <Detail label="Cost price">{fmtMoney(p.costPrice)}</Detail>
                      <Detail label="Margin / unit">
                        <span className={unitMargin >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                          {fmtSignedMoney(unitMargin)}
                        </span>
                      </Detail>
                      {niche.trackStock && (
                        <Detail label="Stock value (cost)">
                          {fmtMoney((Number(p.costPrice) || 0) * stock)}
                        </Detail>
                      )}
                      {niche.hasExpiry && (
                        <Detail label="Expiry">
                          <span className={isExpiringSoon(p) ? 'text-red-500 font-semibold' : ''}>
                            {fmtDate(p.expiryDate)}
                          </span>
                        </Detail>
                      )}
                    </dl>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => openEdit(p)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:border-emerald-500"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 dark:border-red-900 text-xs font-semibold text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add button: floats above the tab bar on phones, above the fold on desktop */}
      <button
        onClick={openAdd}
        aria-label={`Add ${niche.itemNoun.toLowerCase()}`}
        className="fixed bottom-24 md:bottom-8 right-4 z-30 flex items-center gap-2 px-5 py-3.5 rounded-full bg-emerald-500 text-black font-bold text-sm shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 active:scale-95 transition-all"
      >
        <Plus className="w-5 h-5" />
        <span className="hidden sm:inline">{niche.itemNoun}</span>
      </button>

      {/* Add / edit bottom sheet */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? `Edit ${niche.itemNoun}` : `Add ${niche.itemNoun}`}
        >
          <div
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border-t sm:border border-zinc-200 dark:border-zinc-800 p-5 pb-8 sm:p-6 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {editingId ? `Edit ${niche.itemNoun}` : `Add ${niche.itemNoun}`}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <Field label={`${niche.itemNoun} name *`}>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Peak Milk 400g"
                  maxLength={200}
                  aria-label={`${niche.itemNoun} name`}
                  autoFocus
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={niche.hasBarcode ? 'SKU / Barcode' : 'Code (optional)'}>
                  <input
                    className={inputCls}
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="Auto from name"
                    aria-label="SKU / Barcode"
                    maxLength={50}
                  />
                </Field>
                <Field label="Category">
                  <select
                    className={inputCls}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    <option value="General">General</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Cost price (₦)">
                  <input
                    type="number"
                    className={inputCls}
                    value={form.costPrice}
                    onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                    placeholder="0"
                    aria-label="Cost price"
                    min="0"
                  />
                </Field>
                <Field label="Selling price (₦) *">
                  <input
                    type="number"
                    className={inputCls}
                    value={form.salePrice}
                    onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                    placeholder="0"
                    aria-label="Selling price"
                    min="0"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {niche.trackStock && (
                  <Field label="Stock quantity">
                    <input
                      type="number"
                      className={inputCls}
                      value={form.stock}
                      onChange={(e) => setForm({ ...form, stock: e.target.value })}
                      placeholder="0"
                      aria-label="Stock quantity"
                      min="0"
                    />
                  </Field>
                )}
                {niche.hasExpiry && (
                  <Field label="Expiry date">
                    <input
                      type="date"
                      className={inputCls}
                      value={form.expiryDate}
                      onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                      aria-label="Expiry date"
                    />
                  </Field>
                )}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-6 px-4 py-3.5 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Save Changes' : `Add ${niche.itemNoun}`}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${niche.itemNoun}?`}
        message={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ''}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
        active
          ? 'bg-emerald-500 text-black'
          : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
      }`}
    >
      {children}
    </button>
  );
}

function WorthTile({ icon: Icon, accent = 'text-emerald-500', tone = 'positive', label, value, badge, help }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5">
      <div className="flex items-center justify-between">
        <Icon className={`w-4 h-4 ${accent}`} />
        {badge && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              tone === 'positive'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-base font-bold truncate mt-1.5">{value}</p>
      <p className="text-[10px] font-medium text-zinc-500 mt-0.5 flex items-center gap-1">
        <span className="truncate">{label}</span>
        {help && <HelpTip label={`Help: ${label}`} text={help} />}
      </p>
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">
        {label}
      </dt>
      <dd className="font-semibold mt-0.5">{children}</dd>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
