// src/components/QuickAddProduct.jsx
// Scan-to-add flow for barcodes that don't match anything in inventory yet.
// The POS page opens this modal when an unknown barcode is scanned (camera or
// USB scanner): the SKU is pre-filled from the scan, the cashier fills in the
// name and price, and saving creates the product in inventory and returns it
// so the caller can add it straight to the current sale.
//
// Usage:
//   {barcode && (
//     <QuickAddProduct
//       barcode={barcode}
//       storeId={storeId}
//       store={store}
//       niche={niche}
//       categories={categories}
//       onCreated={(product) => addToCart(product)}
//       onCancel={() => setBarcode(null)}
//     />
//   )}
//
// Escape closes the modal (from anywhere, even while typing in a field).
import { useEffect, useState } from 'react';
import { PackagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/backend';
import { sanitize, isValidItemName } from '../lib/validate';

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

export default function QuickAddProduct({
  barcode,
  storeId,
  store,
  niche,
  categories = [],
  onCreated,
  onCancel,
}) {
  const [form, setForm] = useState({
    name: '',
    sku: barcode || '',
    category: '',
    costPrice: '',
    salePrice: '',
    // The item the cashier is scanning is physically in hand, so start with
    // one unit — required for the stock-tracked sale to go through.
    stock: niche.trackStock ? '1' : '',
    expiryDate: '',
  });
  const [saving, setSaving] = useState(false);

  // Escape closes the modal, even while a form field has focus.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const cleanName = sanitize(form.name);
    if (!isValidItemName(cleanName)) {
      return toast.error(`${niche.itemNoun} name is required (1 to 200 characters).`);
    }
    const salePrice = Number(form.salePrice);
    if (!(salePrice > 0)) {
      return toast.error('Selling price must be greater than zero.');
    }
    const costPrice = Number(form.costPrice) || 0;
    if (costPrice < 0) {
      return toast.error('Cost price cannot be negative.');
    }
    const stock = niche.trackStock
      ? Math.max(0, Math.floor(Number(form.stock) || 0))
      : 0;
    if (niche.trackStock && stock < 1) {
      return toast.error(
        'Stock must be at least 1 — the item is being added to the sale.'
      );
    }

    setSaving(true);
    try {
      const product = await api.products.create(storeId, {
        name: cleanName,
        sku: sanitize(form.sku),
        category: sanitize(form.category) || 'General',
        costPrice,
        salePrice,
        stock,
        expiryDate: niche.hasExpiry && form.expiryDate ? form.expiryDate : null,
      });

      // Keep the onboarding flag in sync with the Inventory page.
      if (!store?.onboarding?.firstProductAdded) {
        try {
          await api.stores.update(storeId, {
            onboarding: { firstProductAdded: true },
          });
        } catch (err) {
          console.error('Could not update first-product flag', err);
        }
      }

      onCreated(product);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not create product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={`Quick add ${niche.itemNoun}`}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-emerald-500" />
            Quick Add {niche.itemNoun}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close quick add"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
          Barcode{' '}
          <span className="font-mono font-semibold text-zinc-900 dark:text-white break-all">
            {barcode}
          </span>{' '}
          isn&rsquo;t in your inventory yet. Save it below — the{' '}
          {niche.itemNoun.toLowerCase()} is added to inventory and to the
          current sale.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Field label="SKU / Barcode">
              <input
                className={`${inputCls} font-mono`}
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder={barcode || 'e.g. 6901234567890'}
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
                step="0.01"
              />
            </Field>
          </div>

          {(niche.trackStock || niche.hasExpiry) && (
            <div className="grid grid-cols-2 gap-3">
              {niche.trackStock && (
                <Field label="Stock quantity">
                  <input
                    type="number"
                    className={inputCls}
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    min="1"
                  />
                </Field>
              )}
              {niche.hasExpiry && (
                <Field label="Expiry date">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({ ...form, expiryDate: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-2xl bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add to cart'}
            </button>
          </div>
        </form>
      </div>
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
