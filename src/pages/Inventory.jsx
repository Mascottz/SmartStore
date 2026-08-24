// src/pages/Inventory.jsx
import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';

const LOW_STOCK_THRESHOLD = 50;

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

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
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
  }, [products, searchTerm, sortBy]);

  const inventoryValue = useMemo(
    () =>
      products.reduce(
        (sum, p) => sum + (Number(p.costPrice) || 0) * (Number(p.stock) || 0),
        0
      ),
    [products]
  );

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
    if (!form.name.trim()) return toast.error(`${niche.itemNoun} name is required.`);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category: form.category || 'General',
        costPrice: Number(form.costPrice || 0),
        salePrice: Number(form.salePrice || 0),
        stock: niche.trackStock ? Number(form.stock || 0) : 0,
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

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try {
      await api.products.remove(p.id);
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message || 'Could not delete.');
    }
  };

  const isExpiringSoon = (p) => {
    if (!p.expiryDate) return false;
    const days = (new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
    return days < 90;
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
            {niche.trackStock && <> · Stock value {fmtMoney(inventoryValue)}</>}
            {niche.trackStock && lowStockCount > 0 && (
              <span className="text-amber-500"> · {lowStockCount} low stock</span>
            )}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400"
        >
          <Plus className="w-4 h-4" /> Add {niche.itemNoun}
        </button>
      </div>

      {/* Search & sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${niche.itemNounPlural.toLowerCase()} by name, SKU or category…`}
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
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
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-zinc-500">
                    No {niche.itemNounPlural.toLowerCase()} yet. Add your first one!
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
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editingId ? `Edit ${niche.itemNoun}` : `Add ${niche.itemNoun}`}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={niche.hasBarcode ? 'SKU / Barcode' : 'Code (optional)'}>
                  <input
                    className={inputCls}
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="e.g. PK-400"
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
                  />
                </Field>
                <Field label="Selling price (₦)">
                  <input
                    type="number"
                    className={inputCls}
                    value={form.salePrice}
                    onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                    placeholder="0"
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
              {saving ? 'Saving…' : editingId ? 'Save Changes' : `Add ${niche.itemNoun}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

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
