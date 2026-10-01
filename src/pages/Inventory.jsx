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
  Layers,
  Pill,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { api } from '../lib/backend';
import { fmtMoney, fmtDate } from '../lib/format';
import { sanitize, isValidItemName } from '../lib/validate';
import { generateSku } from '../lib/sku';
import { canUseAssistant } from '../lib/assistant';
import { parseStoreSenseInventory, isStoreSenseRowReady } from '../lib/storeSenseInventory';
import { downloadCsv } from '../lib/exportCsv';
import {
  EXPIRY_BUCKETS,
  daysUntil,
  earliestActiveExpiry,
  sellableQty,
} from '../lib/pharmacy';
import ConfirmDialog from '../components/ConfirmDialog';
import StoreSenseMark from '../components/StoreSenseMark';
import HelpTip from '../components/HelpTip';
import BatchDrawer from '../components/BatchDrawer';

const LOW_STOCK_THRESHOLD = 50;

// Money with the sign out front; "-₦300" reads better on the profit tile
// than the "₦-300" fmtMoney would build for a negative number.
const fmtSignedMoney = (n) => (n < 0 ? `-${fmtMoney(Math.abs(n))}` : fmtMoney(n));

const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Cream',
  'Ointment',
  'Drops',
  'Inhaler',
  'Suppository',
  'Sachet',
  'Other',
];

const emptyForm = {
  name: '',
  sku: '',
  category: '',
  costPrice: '',
  salePrice: '',
  stock: '',
  expiryDate: '',
  genericName: '',
  strength: '',
  dosageForm: '',
  packSize: '',
  isRx: false,
  isControlled: false,
  batchNo: '',
  supplier: '',
};

export default function Inventory() {
  const { storeId, niche, store, plan, storeIsDemo } = useAuth();

  // Pharmacy Mode: stock lives in batches, and this page grows the batch
  // drawer, medicine fields and the expiry watch strip.
  const isPharmacy = Boolean(niche.pharmacy);

  const { data: products, loading } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );
  const { data: categories } = useStoreData(
    () => (storeId ? api.categories.list(storeId) : []),
    [storeId]
  );
  const { data: batches } = useStoreData(
    () => (storeId && isPharmacy ? api.batches.list(storeId) : []),
    [storeId, isPharmacy]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showStoreSense, setShowStoreSense] = useState(false);
  const [storeSenseInput, setStoreSenseInput] = useState('');
  const [storeSenseDraft, setStoreSenseDraft] = useState(null);
  const [importingStoreSense, setImportingStoreSense] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 200);
  const storeSenseEnabled = canUseAssistant({ plan, storeIsDemo });

  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const storeSenseReadyRows = useMemo(
    () => (storeSenseDraft?.rows || []).filter(isStoreSenseRowReady),
    [storeSenseDraft]
  );

  const [batchProduct, setBatchProduct] = useState(null);

  // The row being edited, for the read-only stock note in the modal.
  const editingProduct = useMemo(
    () => (editingId ? products.find((p) => p.id === editingId) || null : null),
    [products, editingId]
  );

  // productId → its batches, so table rows and the drawer read one map.
  const batchesByProduct = useMemo(() => {
    const map = new Map();
    if (isPharmacy) {
      (batches || []).forEach((b) => {
        const list = map.get(b.productId) || [];
        list.push(b);
        map.set(b.productId, list);
      });
    }
    return map;
  }, [batches, isPharmacy]);

  // Expiry watch: active bucketed by how soon each batch expires, with the
  // money tied up in each bucket. Expired stock is stock that cannot be
  // sold - the number a pharmacist wants front and centre.
  const expiryWatch = useMemo(() => {
    if (!isPharmacy) return null;
    const byBucket = { expired: { units: 0, value: 0 }, d30: { units: 0, value: 0 }, d60: { units: 0, value: 0 }, d90: { units: 0, value: 0 } };
    const today = new Date();
    (batches || []).forEach((b) => {
      if ((b.status || 'active') !== 'active') return;
      const days = daysUntil(b.expiryDate, today);
      if (days == null) return;
      const qty = Number(b.qty) || 0;
      if (qty <= 0) return;
      const bucket = days < 0 ? 'expired' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'd90';
      byBucket[bucket].units += qty;
      byBucket[bucket].value += qty * (Number(b.costPrice) || 0);
    });
    const atRisk = byBucket.expired.value + byBucket.d30.value + byBucket.d60.value + byBucket.d90.value;
    return { byBucket, atRisk };
  }, [batches, isPharmacy]);

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

  // What the shelves are worth right now. Always the whole catalogue; the
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
    // what it cost), the number a shop owner reads as "% margin".
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

  const openStoreSense = () => {
    if (!storeSenseEnabled) {
      toast.error('StoreSense comes with Owner Mode.');
      return;
    }
    setStoreSenseDraft(null);
    setShowStoreSense(true);
  };

  const closeStoreSense = () => {
    if (importingStoreSense) return;
    setShowStoreSense(false);
    setStoreSenseInput('');
    setStoreSenseDraft(null);
  };

  const arrangeStoreSenseInput = () => {
    const draft = parseStoreSenseInventory(storeSenseInput, {
      existingSkus: products.map((p) => p.sku),
      categories: categoryNames,
      trackStock: niche.trackStock,
      hasExpiry: niche.hasExpiry,
    });
    setStoreSenseDraft(draft);
    if (!draft.rows.length) {
      toast.error('StoreSense could not find any inventory lines yet.');
    }
  };

  const updateStoreSenseRow = (index, patch) => {
    setStoreSenseDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        rows: draft.rows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, ...patch } : row
        ),
      };
    });
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
      genericName: p.genericName || '',
      strength: p.strength || '',
      dosageForm: p.dosageForm || '',
      packSize: p.packSize || '',
      isRx: Boolean(p.isRx),
      isControlled: Boolean(p.isControlled),
      batchNo: '',
      supplier: '',
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
      // Blank SKU → a readable code built from the product's own name
      // (e.g. "Peak Milk 400g" → "PEA-MIL-400G-A7F3"), avoiding any code
      // another product in this store already uses.
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
        genericName: sanitize(form.genericName || ''),
        strength: sanitize(form.strength || ''),
        dosageForm: sanitize(form.dosageForm || ''),
        packSize: sanitize(form.packSize || ''),
        isRx: isPharmacy && Boolean(form.isRx),
        isControlled: isPharmacy && Boolean(form.isControlled),
      };

      // Pharmacy products open life with their first batch - stock and
      // expiry are batch-tracked from the very first unit.
      if (isPharmacy && !editingId) {
        const openingQty = Math.max(0, Math.floor(Number(form.stock) || 0));
        payload.openingBatch = openingQty
          ? {
              qty: openingQty,
              batchNo: sanitize(form.batchNo || '') || 'OPENING',
              expiryDate: form.expiryDate || null,
              supplier: sanitize(form.supplier || ''),
              costPrice,
            }
          : null;
        payload.stock = 0;
        payload.expiryDate = null;
      }

      // Editing a medicine: batches own stock and expiry, so this dialog
      // never writes them (the batch drawer does).
      if (isPharmacy && editingId) {
        delete payload.stock;
        delete payload.expiryDate;
      }

      if (editingId) {
        await api.products.update(editingId, payload);
        toast.success(
          autoSku ? `${niche.itemNoun} updated, SKU ${sku}` : `${niche.itemNoun} updated`
        );
      } else {
        await api.products.create(storeId, payload);
        if (!store?.onboarding?.firstProductAdded) {
          await api.stores.update(storeId, {
            onboarding: { firstProductAdded: true },
          });
        }
        toast.success(
          autoSku ? `${niche.itemNoun} added, SKU ${sku}` : `${niche.itemNoun} added`
        );
      }
      setShowModal(false);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };


  const handleStoreSenseImport = async () => {
    if (!storeId) return toast.error('Store not ready yet. Try again in a second.');
    const rows = (storeSenseDraft?.rows || []).filter(isStoreSenseRowReady);
    if (!rows.length) return toast.error('No ready inventory rows to save yet.');

    setImportingStoreSense(true);
    try {
      const usedSkus = new Set(products.map((p) => String(p.sku || '').toLowerCase()).filter(Boolean));
      for (const row of rows) {
        const cleanName = sanitize(row.name);
        let sku = sanitize(row.sku);
        if (!sku || usedSkus.has(sku.toLowerCase())) {
          sku = generateSku(cleanName, [...usedSkus]);
        }
        usedSkus.add(sku.toLowerCase());

        const rowStock = niche.trackStock
          ? Math.max(0, Math.floor(Number(row.stock) || 0))
          : 0;
        await api.products.create(storeId, {
          name: cleanName,
          sku,
          category: sanitize(row.category) || 'General',
          costPrice: Math.max(0, Number(row.costPrice) || 0),
          salePrice: Math.max(0, Number(row.salePrice) || 0),
          stock: rowStock,
          expiryDate: niche.hasExpiry && row.expiryDate ? row.expiryDate : null,
          // Pasted pharmacy lists carry one expiry per line, which becomes
          // the product's opening batch.
          ...(isPharmacy && rowStock > 0
            ? {
                openingBatch: {
                  qty: rowStock,
                  batchNo: 'OPENING',
                  expiryDate: row.expiryDate || null,
                  costPrice: Math.max(0, Number(row.costPrice) || 0),
                  supplier: '',
                },
              }
            : {}),
        });
      }

      if (!store?.onboarding?.firstProductAdded) {
        await api.stores.update(storeId, {
          onboarding: { firstProductAdded: true },
        });
      }

      toast.success(
        `StoreSense added ${rows.length} ${rows.length === 1 ? niche.itemNoun.toLowerCase() : niche.itemNounPlural.toLowerCase()}.`
      );
      closeStoreSense();
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'StoreSense could not save these items.');
    } finally {
      setImportingStoreSense(false);
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
    // Pharmacy expiry comes from the batches (products.expiryDate mirrors
    // the earliest active batch, but batches are the truth).
    const expiry = isPharmacy
      ? earliestActiveExpiry(batchesByProduct.get(p.id)) || p.expiryDate
      : p.expiryDate;
    if (!expiry) return false;
    const days = daysUntil(expiry);
    return days != null && days < 90;
  };

  const handleExport = () => {
    if (isPharmacy) {
      const headers = [
        'Name',
        'Generic',
        'Strength',
        'Form',
        'Pack Size',
        'Rx',
        'Controlled',
        'SKU',
        'Category',
        'Cost Price',
        'Selling Price',
        'Stock',
        'Earliest Expiry',
        'Batches',
      ];
      const rows = products.map((p) => [
        p.name,
        p.genericName || '',
        p.strength || '',
        p.dosageForm || '',
        p.packSize || '',
        p.isRx ? 'Yes' : 'No',
        p.isControlled ? 'Yes' : 'No',
        p.sku,
        p.category,
        p.costPrice,
        p.salePrice,
        p.stock,
        p.expiryDate || '',
        (batchesByProduct.get(p.id) || [])
          .map((b) => `${b.batchNo || '-'}:${b.qty}:${b.expiryDate || 'no expiry'}`)
          .join(' | '),
      ]);
      downloadCsv(`${store?.name || 'inventory'}-export`, headers, rows);
      toast.success('Exported to CSV');
      return;
    }
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
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            {niche.itemNounPlural === 'Products' ? 'Inventory' : niche.itemNounPlural}
            {isPharmacy && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <Pill className="w-3 h-3" /> Pharmacy Mode
              </span>
            )}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {products.length} {niche.itemNounPlural.toLowerCase()}
            {niche.trackStock && (
              <> &middot; {valuation.units.toLocaleString('en-NG')} units in stock</>
            )}
            {niche.trackStock && lowStockCount > 0 && (
              <span className="text-amber-500"> &middot; {lowStockCount} low stock</span>
            )}
            {expiryWatch && expiryWatch.byBucket.expired.units > 0 && (
              <span className="text-red-500">
                {' '}
                &middot; {expiryWatch.byBucket.expired.units} unit
                {expiryWatch.byBucket.expired.units === 1 ? '' : 's'} expired
              </span>
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
          {storeSenseEnabled && (
            <button
              onClick={openStoreSense}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-semibold hover:border-emerald-500 hover:bg-emerald-500/15 transition-all"
              aria-label="Open StoreSense inventory input"
            >
              <StoreSenseMark className="w-4 h-4" /> StoreSense
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
          bring in, and the profit in between. Always the whole catalogue;
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
            help="Retail value minus cost. The margin badge shows that profit as a percentage of what the stock would sell for, the figure most owners read as profit margin."
          />
        </section>
      )}

      {/* Pharmacy expiry watch: what is expired or about to, and the money
          tied up in it. Sits above the table because it is the question a
          pharmacist asks first every morning. */}
      {expiryWatch && products.length > 0 && (
        <section
          aria-label="Expiry watch"
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-6"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Expiry watch
              <HelpTip
                label="Help: Expiry watch"
                text="Every active batch bucketed by how soon it expires, with what that stock cost. Expired and quarantined batches are never dispensed: quarantine them from a product's batch drawer."
              />
            </h2>
            <p className="text-xs text-zinc-500">
              {fmtMoney(expiryWatch.atRisk)} at risk
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {EXPIRY_BUCKETS.map((bucket) => {
              const data = expiryWatch.byBucket[bucket.key];
              const isRed = bucket.tone === 'red';
              const empty = data.units === 0;
              return (
                <div
                  key={bucket.key}
                  className={`rounded-xl border p-3 ${
                    empty
                      ? 'border-zinc-200 dark:border-zinc-800 opacity-60'
                      : isRed
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-amber-500/30 bg-amber-500/5'
                  }`}
                >
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      empty
                        ? 'text-zinc-400'
                        : isRed
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {bucket.label}
                  </p>
                  <p className="text-lg font-bold mt-0.5">
                    {data.units.toLocaleString('en-NG')}
                    <span className="text-xs font-normal text-zinc-500"> units</span>
                  </p>
                  <p className="text-[11px] text-zinc-500">{fmtMoney(data.value)} at cost</p>
                </div>
              );
            })}
          </div>
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
                filtered.map((p) => {
                  const productBatches = batchesByProduct.get(p.id) || [];
                  const sellable = isPharmacy
                    ? productBatches.length > 0
                      ? sellableQty(productBatches)
                      : Number(p.stock) || 0
                    : Number(p.stock) || 0;
                  const blocked = (Number(p.stock) || 0) - sellable;
                  return (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{p.name}</span>
                        {p.isRx && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30"
                            title="Prescription-only"
                          >
                            Rx
                          </span>
                        )}
                        {p.isControlled && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                            title="Controlled medicine - recorded in the controlled register"
                          >
                            CD
                          </span>
                        )}
                      </div>
                      {isPharmacy && (p.strength || p.dosageForm || p.genericName) && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {[p.strength, p.dosageForm, p.packSize].filter(Boolean).join(' ')}
                          {p.genericName ? `${p.strength || p.dosageForm ? ' · ' : ''}${p.genericName}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{p.sku || '-'}</td>
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
                        {isPharmacy && blocked > 0 && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            {sellable} in-date
                          </p>
                        )}
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
                        {isPharmacy && productBatches.length > 1 && (
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            {productBatches.length} batches
                          </p>
                        )}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {isPharmacy && (
                          <button
                            onClick={() => setBatchProduct(p)}
                            className="p-2 rounded-xl text-zinc-500 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            aria-label={`Manage batches for ${p.name}`}
                            title="Batches & expiry"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                        )}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* StoreSense raw inventory intake */}
      {showStoreSense && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeStoreSense}
          role="dialog"
          aria-modal="true"
          aria-label="StoreSense inventory input"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-200 bg-white/95 px-6 py-5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <StoreSenseMark className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold">StoreSense inventory input</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    Paste a messy stock list and StoreSense will arrange it into inventory rows,
                    generate missing SKUs, and let you review everything before saving.
                  </p>
                </div>
              </div>
              <button
                onClick={closeStoreSense}
                disabled={importingStoreSense}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                aria-label="Close StoreSense"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Best results: one item per line, with labels or columns.
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Examples: <span className="font-mono">Peak Milk 400g cost 1200 sell 1500 stock 24 category Beverages</span> · <span className="font-mono">Indomie Chicken, Food Cupboard, 170, 250, 40</span> · <span className="font-mono">name,category,cost,selling price,stock</span>
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Raw inventory input
                </label>
                <textarea
                  value={storeSenseInput}
                  onChange={(e) => {
                    setStoreSenseInput(e.target.value);
                    setStoreSenseDraft(null);
                  }}
                  placeholder={`Paste lines like:
Peak Milk 400g cost 1200 sell 1500 stock 24 category Beverages
Eva Water 75cl, Beverages, 80, 150, 36
Golden Penny Spaghetti sku GPS-500 price 850 qty 12`}
                  className="min-h-44 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm leading-6 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
                  aria-label="Raw inventory input"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  StoreSense never saves automatically. Review the preview, fix any row, then save.
                </p>
                <button
                  type="button"
                  onClick={arrangeStoreSenseInput}
                  disabled={!storeSenseInput.trim() || importingStoreSense}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  <StoreSenseMark className="h-4 w-4" />
                  Arrange with StoreSense
                </button>
              </div>

              {storeSenseDraft && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium">
                      {storeSenseReadyRows.length} of {storeSenseDraft.rows.length} rows ready to save
                    </p>
                    {storeSenseDraft.rejected.length > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {storeSenseDraft.rejected.length} line(s) need a clearer format.
                      </p>
                    )}
                  </div>

                  {storeSenseDraft.rows.length > 0 && (
                    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                      <table className="w-full min-w-[860px] text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                            <th className="px-3 py-3">Status</th>
                            <th className="px-3 py-3">Name</th>
                            <th className="px-3 py-3">SKU / Barcode</th>
                            <th className="px-3 py-3">Category</th>
                            <th className="px-3 py-3 text-right">Cost</th>
                            <th className="px-3 py-3 text-right">Price *</th>
                            {niche.trackStock && <th className="px-3 py-3 text-right">Stock</th>}
                            {niche.hasExpiry && <th className="px-3 py-3">Expiry</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {storeSenseDraft.rows.map((row, index) => {
                            const issues = storeSenseRowIssues(row);
                            const ready = issues.length === 0;
                            return (
                              <tr key={`${row.lineNumber}-${index}`} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800/70">
                                <td className="px-3 py-3">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                                      ready
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    }`}
                                  >
                                    {ready ? 'Ready' : issues.join(', ')}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    value={row.name}
                                    onChange={(e) => updateStoreSenseRow(index, { name: e.target.value })}
                                    className={previewInputCls}
                                    aria-label={`StoreSense row ${index + 1} name`}
                                  />
                                  <p className="mt-1 line-clamp-2 text-[10px] text-zinc-400">Line {row.lineNumber}: {row.raw}</p>
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    value={row.sku}
                                    onChange={(e) => updateStoreSenseRow(index, { sku: e.target.value })}
                                    className={previewInputCls}
                                    aria-label={`StoreSense row ${index + 1} SKU`}
                                    maxLength={50}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    value={row.category}
                                    onChange={(e) => updateStoreSenseRow(index, { category: e.target.value })}
                                    className={previewInputCls}
                                    aria-label={`StoreSense row ${index + 1} category`}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    type="number"
                                    value={row.costPrice || ''}
                                    onChange={(e) => updateStoreSenseRow(index, { costPrice: e.target.value })}
                                    className={`${previewInputCls} text-right`}
                                    aria-label={`StoreSense row ${index + 1} cost price`}
                                    min="0"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    type="number"
                                    value={row.salePrice || ''}
                                    onChange={(e) => updateStoreSenseRow(index, { salePrice: e.target.value })}
                                    className={`${previewInputCls} text-right`}
                                    aria-label={`StoreSense row ${index + 1} selling price`}
                                    min="0"
                                  />
                                </td>
                                {niche.trackStock && (
                                  <td className="px-3 py-3">
                                    <input
                                      type="number"
                                      value={row.stock || ''}
                                      onChange={(e) => updateStoreSenseRow(index, { stock: e.target.value })}
                                      className={`${previewInputCls} text-right`}
                                      aria-label={`StoreSense row ${index + 1} stock`}
                                      min="0"
                                    />
                                  </td>
                                )}
                                {niche.hasExpiry && (
                                  <td className="px-3 py-3">
                                    <input
                                      type="date"
                                      value={row.expiryDate || ''}
                                      onChange={(e) => updateStoreSenseRow(index, { expiryDate: e.target.value })}
                                      className={previewInputCls}
                                      aria-label={`StoreSense row ${index + 1} expiry date`}
                                    />
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {storeSenseDraft.rejected.length > 0 && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        Lines StoreSense could not arrange
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                        {storeSenseDraft.rejected.map((line) => (
                          <li key={`${line.lineNumber}-${line.raw}`}>
                            Line {line.lineNumber}: {line.raw} - {line.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-zinc-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeStoreSense}
                disabled={importingStoreSense}
                className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-50 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStoreSenseImport}
                disabled={!storeSenseReadyRows.length || importingStoreSense}
                className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importingStoreSense
                  ? 'Saving...'
                  : `Save ${storeSenseReadyRows.length || ''} ready ${storeSenseReadyRows.length === 1 ? niche.itemNoun.toLowerCase() : niche.itemNounPlural.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  aria-label={`${niche.itemNoun} name`}
                  autoFocus
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={niche.hasBarcode ? 'SKU / Barcode' : 'Code (optional)'}
                  help={
                    niche.hasBarcode
                      ? 'Scan or type the printed barcode if the item has one. Leave it blank and SmartStore generates a readable code from the name, like PEA-MIL-400G-A7F3; it can be searched at the POS straight away.'
                      : 'Leave it blank and SmartStore generates a readable code from the name, like PEA-MIL-400G-A7F3. Type your own only if you already use codes elsewhere.'
                  }
                >
                  <input
                    className={inputCls}
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="Auto-generated from the name"
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

              {isPharmacy && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                    Medicine details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Generic name">
                      <input
                        className={inputCls}
                        value={form.genericName}
                        onChange={(e) => setForm({ ...form, genericName: e.target.value })}
                        placeholder="e.g. Amoxicillin"
                        aria-label="Generic name"
                        maxLength={200}
                      />
                    </Field>
                    <Field label="Strength">
                      <input
                        className={inputCls}
                        value={form.strength}
                        onChange={(e) => setForm({ ...form, strength: e.target.value })}
                        placeholder="e.g. 500 mg"
                        aria-label="Strength"
                        maxLength={60}
                      />
                    </Field>
                    <Field label="Dosage form">
                      <select
                        className={inputCls}
                        value={form.dosageForm}
                        onChange={(e) => setForm({ ...form, dosageForm: e.target.value })}
                        aria-label="Dosage form"
                      >
                        <option value="">Select...</option>
                        {DOSAGE_FORMS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Pack size">
                      <input
                        className={inputCls}
                        value={form.packSize}
                        onChange={(e) => setForm({ ...form, packSize: e.target.value })}
                        placeholder="e.g. pack of 100"
                        aria-label="Pack size"
                        maxLength={60}
                      />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isRx}
                      onChange={(e) => setForm({ ...form, isRx: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500"
                      aria-label="Prescription-only medicine"
                    />
                    <span>
                      Prescription-only{' '}
                      <span className="text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-500/30 rounded px-1">
                        Rx
                      </span>{' '}
                      - the till asks for a prescription check before selling
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isControlled}
                      onChange={(e) => setForm({ ...form, isControlled: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500"
                      aria-label="Controlled medicine"
                    />
                    <span>
                      Controlled{' '}
                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/30 rounded px-1">
                        CD
                      </span>{' '}
                      - every dispensing is written to the Controlled Register
                    </span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {niche.trackStock && !isPharmacy && (
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
                {niche.hasExpiry && !isPharmacy && (
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
                {isPharmacy && !editingId && (
                  <Field
                    label="Opening quantity"
                    help="Medicine stock is tracked in batches. This becomes the product's first batch; receive new deliveries from the batch drawer on the inventory row."
                  >
                    <input
                      type="number"
                      className={inputCls}
                      value={form.stock}
                      onChange={(e) => setForm({ ...form, stock: e.target.value })}
                      placeholder="0"
                      aria-label="Opening stock quantity"
                      min="0"
                    />
                  </Field>
                )}
                {isPharmacy && !editingId && (
                  <Field label="Expiry date (first batch)">
                    <input
                      type="date"
                      className={inputCls}
                      value={form.expiryDate}
                      onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                      aria-label="First batch expiry date"
                    />
                  </Field>
                )}
                {isPharmacy && !editingId && (
                  <Field label="Batch no. (optional)">
                    <input
                      className={inputCls}
                      value={form.batchNo}
                      onChange={(e) => setForm({ ...form, batchNo: e.target.value })}
                      placeholder="From the carton, e.g. B-2419"
                      aria-label="Batch number"
                      maxLength={60}
                    />
                  </Field>
                )}
                {isPharmacy && !editingId && (
                  <Field label="Supplier (optional)">
                    <input
                      className={inputCls}
                      value={form.supplier}
                      onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                      placeholder="e.g. Emzor"
                      aria-label="Supplier"
                      maxLength={120}
                    />
                  </Field>
                )}
              </div>

              {isPharmacy && editingId && (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 text-sm text-zinc-600 dark:text-zinc-300">
                  <p className="font-semibold text-sm">
                    Stock: {editingProduct?.stock ?? 0} units ·{' '}
                    {editingProduct?.expiryDate
                      ? `earliest expiry ${fmtDate(editingProduct.expiryDate)}`
                      : 'no expiry recorded'}
                  </p>
                  <p className="text-xs mt-1 text-zinc-500 dark:text-zinc-400">
                    Medicine stock is managed per batch (FEFO). Close this dialog and use
                    the <Layers className="w-3 h-3 inline -mt-0.5" /> batches action on
                    the product's row to receive stock, quarantine a batch or fix an
                    expiry date.
                  </p>
                </div>
              )}
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

      {/* Pharmacy batch drawer */}
      {batchProduct && (
        <BatchDrawer
          product={batchProduct}
          batches={batches || []}
          onClose={() => setBatchProduct(null)}
        />
      )}
    </div>
  );
}

const storeSenseRowIssues = (row) =>
  [
    !sanitize(row?.name) ? 'Add name' : null,
    Number(row?.salePrice) <= 0 ? 'Add selling price' : null,
  ].filter(Boolean);

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';

const previewInputCls =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900';

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

function Field({ label, help, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </label>
        {help && <HelpTip label={`Help: ${label}`} text={help} />}
      </div>
      {children}
    </div>
  );
}
