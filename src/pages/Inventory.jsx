// src/pages/Inventory.jsx
import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Download,
  Wallet,
  Tag,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';
import { sanitize, isValidItemName } from '../lib/validate';
import { downloadCsv } from '../lib/exportCsv';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';

const LOW_STOCK_THRESHOLD = 50;

// Money with the sign out front — "-₦300" reads better on the profit tile
// than the "₦-300" fmtMoney would build for a negative number.
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

export default function Inventory() {
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
  const [sortBy, setSortBy] = useState('name');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 200);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    const list = products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term)
    );
    return [...list].sort((a, b) => {
      if (sortBy === 'stock') return (b.stock || 0) - (a.stock || 0);
      if (sortBy === 'price') return (b.salePrice || 0) - (a.salePrice || 0);
      return a.name.localeCompare(b.name);
    });
  }, [products, debouncedSearch, sortBy]);

  // What the shelves are worth right now. Always the whole catalogue — the
  // search box filters the table, not the money summary.
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
    // Gross margin: profit as a percentage of what the stock sells for (not of
    // what it cost) — the number a shop owner reads as "% margin".
    const marginPct = retailValue > 0 ? (profit / retailValue) * 100 : 0;
    return { costValue, retailValue, profit, marginPct, units };
  }, [products]);

  const lowStockCount = useMemo(
    () => products.filter((p) => (p.stock || 0) < LOW_STOCK_THRESHOLD).length,
    [products]
  );

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
    if (salePrice <= 0) {
      return toast.error('Selling price must be greater than zero.');
    }
    if (costPrice < 0) {
      return toast.error('Cost price cannot be negative.');
    }

    setSaving(true);
    try {
      const payload = {
        name: cleanName,
        sku: sanitize(form.sku),
        category: sanitize(form.category) || 'General',
        costPrice,
        salePrice,
        stock: niche.trackStock ? Math.max(0, Math.floor(Number(form.stock) || 0)) : 0,
        expiryDate: niche.hasExpiry && form.expiryDate ? form.expiryDate : null,
      };
      if (editingId) {
        await api.products.update(editingId, payload);
        toast.success(`${niche.itemNoun} updated`);
      } else {
        await api.products.create(storeId, payload);
        if (!store?.onboarding?.firstProductAdded) {
          await api.stores.update(storeId, {
            onboarding: { firstProductAdded: true },
          });
        }
        toast.success(`${niche.itemNoun} added`);
      }
      setShowModal(false);
    } catch (e) {
      console.error(e);
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

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {niche.itemNounPlural === 'Products' ? 'Inventory' : niche.itemNounPlural}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {products.length} {niche.itemNounPlural.toLowerCase()}
            {niche.trackStock && (
              <> &middot; {valuation.units.toLocaleString('en-NG')} units in stock</>
            )}
            {niche.trackStock && lowStockCount > 0 && (
              <span className="text-amber-500"> &middot; {lowStockCount} low stock</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {products.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:border-emerald-500 transition-all"
              aria-label="Export inventory to CSV"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
          >
            <Plus className="w-4 h-4" /> Add {niche.itemNoun}
          </button>
        </div>
      </div>

      {/* What the stock on the shelves is worth: what it cost, what it will
          bring in, and the profit in between. Always the whole catalogue —
          the search box filters the table, not the money. */}
      {niche.trackStock && products.length > 0 && (
        <section
          aria-label="Inventory worth summary"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
        >
          <ValueCard
            icon={Wallet}
            accent="text-sky-500"
            label="Stock at cost"
            value={fmtMoney(valuation.costValue)}
            hint={`${valuation.units.toLocaleString('en-NG')} units on hand`}
            help="What every unit currently in stock cost you. This always covers the whole catalogue, even when the table below is filtered by search."
          />
          <ValueCard
            icon={Tag}
            accent="text-emerald-500"
            label="Retail value"
            value={fmtMoney(valuation.retailValue)}
            hint="If every unit sells at list price"
            help="What the shelves are worth at the till if every unit sells at its current selling price. It stays whole-catalogue while you search the list."
          />
          <ValueCard
            icon={TrendingUp}
            accent={valuation.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}
            label="Potential profit"
            value={fmtSignedMoney(valuation.profit)}
            hint={valuation.profit >= 0 ? 'Retail value minus cost' : 'Stock is priced below cost'}
            badge={`${valuation.marginPct.toFixed(1)}% margin`}
            badgeTone={valuation.profit >= 0 ? 'positive' : 'negative'}
            help="Retail value minus cost. The margin badge shows that profit as a percentage of what the stock would sell for — the figure most owners read as profit margin."
          />
        </section>
      )}

      {/* Search & sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${niche.itemNounPlural.toLowerCase()} by name, SKU or category...`}
            aria-label={`Search ${niche.itemNounPlural.toLowerCase()}`}
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort products"
          className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none"
        >
          <option value="name">Sort: Name</option>
          {niche.trackStock && <option value="stock">Sort: Stock</option>}
          <option value="price">Sort: Price</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500 uppercase">
                <th className="px-5 py-3">{niche.itemNoun}</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3 text-right">Cost</th>
                <th className="px-5 py-3 text-right">Price</th>
                {niche.trackStock && <th className="px-5 py-3 text-right">Stock</th>}
                {niche.hasExpiry && <th className="px-5 py-3">Expiry</th>}
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-zinc-500">
                    {debouncedSearch
                      ? `No ${niche.itemNounPlural.toLowerCase()} match "${debouncedSearch}".`
                      : `No ${niche.itemNounPlural.toLowerCase()} yet. Add your first one!`}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 text-zinc-500">{p.sku || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {p.category || 'General'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-500">
                      {fmtMoney(p.costPrice)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {fmtMoney(p.salePrice)}
                    </td>
                    {niche.trackStock && (
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            (p.stock || 0) < LOW_STOCK_THRESHOLD
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {p.stock ?? 0}
                        </span>
                      </td>
                    )}
                    {niche.hasExpiry && (
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            isExpiringSoon(p) ? 'text-red-500 font-semibold' : 'text-zinc-500'
                          }`}
                        >
                          {isExpiringSoon(p) && <AlertTriangle className="w-3 h-3" />}
                          {fmtDate(p.expiryDate)}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? `Edit ${niche.itemNoun}` : `Add ${niche.itemNoun}`}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
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
                  autoFocus
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={niche.hasBarcode ? 'SKU / Barcode' : 'Code (optional)'}>
                  <input
                    className={inputCls}
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="e.g. PK-400"
                    maxLength={50}
                  />
                </Field>
                <Field label="Category">
                  <select
                    className={inputCls}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
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
                    />
                  </Field>
                )}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-6 px-4 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : `Add ${niche.itemNoun}`}
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

/**
 * Summary tile for the inventory worth cards. `badge` is the small pill on the
 * right of the value line (used for the margin percentage).
 */
function ValueCard({
  icon: Icon,
  accent = 'text-emerald-500',
  label,
  value,
  hint,
  badge,
  badgeTone = 'positive',
  help,
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <Icon className={`w-5 h-5 ${accent}`} />
        {badge && (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              badgeTone === 'positive'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-xl md:text-2xl font-bold truncate">{value}</p>
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 mt-1">
        {label}
        {help && (
          <HelpTip
            className="ml-1 -mt-0.5 align-middle"
            label={`Help: ${label}`}
            text={help}
          />
        )}
      </p>
      {hint && <p className="text-[11px] text-zinc-500 mt-0.5">{hint}</p>}
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
