// src/pages/POS.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Printer, Camera, Minus, Plus, Search, Keyboard, ChevronDown } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { useKeyboard } from '../hooks/useKeyboard';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { api } from '../lib/backend';
import { fmtMoney } from '../lib/format';
import { printReceipt } from '../lib/printReceipt';
import { sanitize } from '../lib/validate';
import ConfirmDialog from '../components/ConfirmDialog';
import HelpTip from '../components/HelpTip';
import QuickAddProduct from '../components/QuickAddProduct';

const PAYMENT_METHODS = ['Cash', 'Transfer', 'POS/Card'];

// How many tiles the grid renders per batch. 48 fills the 4-column grid
// (xl:grid-cols-4) six times over, so "Show more" always adds whole rows.
const PAGE_SIZE = 48;
// Sentinel value for the category filter — "everything", not a real category.
const ALL_CATEGORIES = 'All';

/**
 * Category a product belongs to, normalised the same way the inventory form
 * writes it ("General" for anything blank) so tiles and tabs always agree.
 */
const categoryOf = (p) => (p?.category || '').trim() || 'General';

export default function POS() {
  const { storeId, user, role, niche, store, storeName, firstSaleCompleted } = useAuth();

  const { data: products, loading } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );
  const { data: categories } = useStoreData(
    () => (storeId ? api.categories.list(storeId) : []),
    [storeId]
  );

  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Category tab + paged grid. visibleCount grows in PAGE_SIZE batches when
  // "Show more" is pressed and resets whenever the filters change.
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [isScanning, setIsScanning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Barcode scanned by a customer that has no matching product yet — opens
  // the quick-add modal so it can be created and sold in one go.
  const [quickAddBarcode, setQuickAddBarcode] = useState(null);

  const scannerRef = useRef(null);
  const searchRef = useRef(null);
  const productsRef = useRef(products);
  productsRef.current = products;
  // Refs so the stable camera/USB scan handlers always see the latest state
  // without re-creating the camera scanner or re-binding the key listener.
  const quickAddOpenRef = useRef(false);
  quickAddOpenRef.current = quickAddBarcode !== null;
  // { codes: [...], at } — briefly ignore rescans of a barcode that was just
  // created, so a camera still pointed at the box doesn't double-add it.
  const justCreatedRef = useRef(null);

  const debouncedSearch = useDebounce(searchTerm, 200);

  // Pills come from the products themselves (not the store's category list) so
  // a tab is never there for a category nobody sells yet. Counts ride along
  // so the cashier can see how big a shelf is before tapping it.
  const productCategories = useMemo(() => {
    const counts = new Map();
    products.forEach((p) => {
      const name = categoryOf(p);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [products]);

  // The selected category can disappear when the last product in it is renamed
  // or deleted — fall back to "All" instead of an empty grid.
  useEffect(() => {
    if (
      category !== ALL_CATEGORIES &&
      products.length > 0 &&
      !productCategories.some((c) => c.name === category)
    ) {
      setCategory(ALL_CATEGORIES);
    }
  }, [category, productCategories, products.length]);

  const filteredProducts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== ALL_CATEGORIES && categoryOf(p) !== category) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term)
      );
    });
  }, [products, debouncedSearch, category]);

  // Pagination: the grid renders the first `visibleCount` matches and offers
  // the rest behind "Show more", so a 900-SKU store still opens instantly.
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
  const remainingCount = Math.max(0, filteredProducts.length - visibleCount);
  const isFiltered = Boolean(debouncedSearch.trim()) || category !== ALL_CATEGORIES;

  // "Nothing matches" has to say what it matched against, otherwise a cashier
  // blames the search box for a category tab they forgot they picked.
  const emptyMessage = useMemo(() => {
    const noun = niche.itemNounPlural.toLowerCase();
    if (!isFiltered) return `No ${noun} yet. Add some from Inventory.`;
    const bits = [`No ${noun} found`];
    if (debouncedSearch.trim()) bits.push(`for "${debouncedSearch.trim()}"`);
    if (category !== ALL_CATEGORIES) bits.push(`in ${category}`);
    return `${bits.join(' ')}.`;
  }, [niche.itemNounPlural, isFiltered, debouncedSearch, category]);

  // Any change to the filters restarts the batch so the cashier is never
  // looking at "144 of 200" for a search that only matches six items.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, category]);

  const selectCategory = useCallback((name) => setCategory(name), []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setCategory(ALL_CATEGORIES);
  }, []);

  const addToCart = useCallback(
    (product) => {
      setCart((prev) => {
        const existing = prev.find((item) => item.id === product.id);
        if (existing) {
          // Check stock limit for tracked niches
          if (niche.trackStock && existing.qty >= (product.stock ?? Infinity)) {
            toast.error(`Only ${product.stock} in stock`);
            return prev;
          }
          return prev.map((item) =>
            item.id === product.id ? { ...item, qty: item.qty + 1 } : item
          );
        }
        return [...prev, { ...product, qty: 1 }];
      });
      toast.success(`${product.name} added`, { duration: 1200 });
    },
    [niche.trackStock]
  );

  // Unknown barcodes (camera or USB) open the quick-add modal.
  const openQuickAdd = useCallback((code) => {
    if (quickAddOpenRef.current) return; // already quick-adding — ignore
    setQuickAddBarcode(code);
  }, []);

  // Shared result handler for both scanner types: known product → cart,
  // unknown barcode → quick-add modal.
  const handleScanResult = useCallback(
    (code) => {
      // A camera still pointed at the box keeps decoding it — skip the
      // rescans of a barcode that was just quick-added for a few seconds.
      const just = justCreatedRef.current;
      if (
        just &&
        Date.now() - just.at < 5000 &&
        just.codes.includes(code.toLowerCase())
      ) {
        return;
      }
      const text = code.toLowerCase();
      const product =
        productsRef.current.find((p) => (p.sku || '').toLowerCase() === text) ||
        productsRef.current.find((p) => p.name.toLowerCase().includes(text));
      if (product) addToCart(product);
      else openQuickAdd(code);
    },
    [addToCart, openQuickAdd]
  );
  const handleScanResultRef = useRef(handleScanResult);
  handleScanResultRef.current = handleScanResult;

  // Camera barcode scanner
  useEffect(() => {
    if (!isScanning) return;

    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      (decodedText) => handleScanResultRef.current(decodedText),
      () => {}
    );

    scannerRef.current = scanner;
    return () => {
      scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, [isScanning]);

  // USB barcode scanner: scanners type the code rapidly and finish with Enter.
  useBarcodeScanner(
    (code) => handleScanResultRef.current(code),
    { enabled: niche.hasBarcode }
  );

  // Quick add finished: remember the barcode(s) just created, add the new
  // product to the sale and close the modal.
  const handleQuickAddCreated = useCallback(
    (product) => {
      justCreatedRef.current = {
        codes: [quickAddBarcode, product.sku]
          .filter(Boolean)
          .map((c) => String(c).toLowerCase()),
        at: Date.now(),
      };
      addToCart(product);
      setQuickAddBarcode(null);
    },
    [addToCart, quickAddBarcode]
  );
  const closeQuickAdd = useCallback(() => setQuickAddBarcode(null), []);

  // Keyboard shortcuts. While the quick-add modal is open it owns the
  // keyboard (its Escape listener closes the modal), so no page shortcuts.
  const shortcuts = useMemo(() => {
    if (quickAddBarcode !== null) return {};
    return {
      Escape: () => {
        if (isScanning) setIsScanning(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (showVoidConfirm) setShowVoidConfirm(false);
        else if (isFiltered) clearFilters();
        else setSearchTerm('');
      },
      F2: () => searchRef.current?.focus(),
      'Ctrl+Enter': () => {
        if (cart.length > 0 && !isCompleting) completeSaleRef.current();
      },
      'Ctrl+P': () => {
        if (lastSale) printLastReceiptRef.current();
      },
    };
  }, [quickAddBarcode, isScanning, showShortcuts, showVoidConfirm, cart.length, isCompleting, lastSale, isFiltered, clearFilters]);
  useKeyboard(shortcuts);

  const updateQuantity = (id, newQty) => {
    if (newQty < 1) return;
    // Enforce stock limit
    const item = cart.find((i) => i.id === id);
    if (niche.trackStock && item && newQty > (item.stock ?? Infinity)) {
      return toast.error(`Only ${item.stock} in stock`);
    }
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: newQty } : item))
    );
  };

  const removeFromCart = (id) =>
    setCart((prev) => prev.filter((item) => item.id !== id));

  const voidTransaction = () => {
    setCart([]);
    setShowVoidConfirm(false);
    toast.success('Transaction voided');
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.salePrice * item.qty, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const completeSale = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    if (!storeId) return toast.error('Store not ready yet. Try again in a second.');

    const receiptNo = 'SM-' + Date.now().toString().slice(-8);
    setIsCompleting(true);

    try {
      const items = cart.map((item) => ({
        productId: item.id,
        name: sanitize(item.name),
        qty: item.qty,
        price: item.salePrice,
        lineTotal: item.salePrice * item.qty,
      }));

      const sale = await api.sales.create(storeId, {
        items,
        paymentMethod,
        receiptNo,
        cashierEmail: user?.email || '',
        trackStock: niche.trackStock,
      });

      setLastSale({
        id: sale.id,
        receiptNo,
        createdAt: new Date(),
        paymentMethod,
        items,
        total: totalAmount,
      });
      setCart([]);
      setSearchTerm('');
      toast.success(`Sale completed via ${paymentMethod}.`);

      if (!firstSaleCompleted) {
        try {
          await api.stores.update(storeId, {
            onboarding: {
              ...(store?.onboarding || {}),
              firstSaleCompleted: true,
            },
          });
        } catch (e) {
          console.error('Could not update first-sale flag', e);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not complete sale');
    } finally {
      setIsCompleting(false);
    }
  };

  // Thermal 80mm receipt for the last completed sale
  const printLastReceipt = () => {
    if (!lastSale) return toast.error('No completed sale to print yet.');

    const { receiptNo, createdAt, items, total, paymentMethod: method } = lastSale;
    const printed = printReceipt({
      storeName: storeName || 'SmartStore NG',
      receiptNo,
      createdAt,
      items,
      total,
      paymentMethod: method,
      cashier: user?.email || '',
      cashierRole: role || '',
    });
    if (!printed) toast.error('Pop-up blocked. Please allow pop-ups for receipts.');
  };

  // Refs for keyboard shortcut callbacks (avoids stale closures)
  const completeSaleRef = useRef(completeSale);
  completeSaleRef.current = completeSale;
  const printLastReceiptRef = useRef(printLastReceipt);
  printLastReceiptRef.current = printLastReceipt;

  return (
    <div className="p-4 md:p-6 flex flex-col lg:flex-row gap-6 min-h-screen">
      {/* Product grid */}
      <div className="flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold">POS Register</h1>
            <HelpTip
              label="Help: POS Register"
              iconClassName="w-8 h-8"
              text="Tap any item to add it to the current sale. Search by name, SKU or category, scan a barcode, or use the category pills below to narrow the shelf you are selling from."
            />
          </div>
          <div className="flex items-center gap-2">
            {niche.hasBarcode && (
              <button
                onClick={() => setIsScanning((s) => !s)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${
                  isScanning
                    ? 'bg-red-500/10 border-red-500 text-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 hover:border-emerald-500'
                }`}
                aria-label={isScanning ? 'Stop barcode scanner' : 'Start barcode scanner'}
              >
                <Camera className="w-4 h-4" />
                {isScanning ? 'Stop Scanner' : 'Scan Barcode'}
              </button>
            )}
            <button
              onClick={() => setShowShortcuts((s) => !s)}
              className="p-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:border-emerald-500 transition-all"
              title="Keyboard shortcuts"
              aria-label="Show keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Shortcuts panel */}
        {showShortcuts && (
          <div className="mb-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm">
            <h3 className="font-semibold mb-2">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-2 text-zinc-500 dark:text-zinc-400">
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">F2</kbd> Focus search</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Ctrl+Enter</kbd> Complete sale</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Ctrl+P</kbd> Print receipt</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Esc</kbd> Clear search &amp; filters / close</span>
            </div>
          </div>
        )}

        {isScanning && (
          <div className="mb-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
            <div id="reader" />
          </div>
        )}

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={searchRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${niche.itemNounPlural.toLowerCase()} by name, SKU or category...`}
            aria-label={`Search ${niche.itemNounPlural.toLowerCase()}`}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-emerald-500 text-sm"
          />
          {niche.hasBarcode && (
            <p className="mt-1.5 pl-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              USB barcode scanners are detected automatically, anywhere on this page.
              Scanning an unknown barcode opens quick add.
            </p>
          )}
        </div>

        {/* Category filters: one pill per category the store actually sells,
            scrollable sideways so long niche lists never wrap the header. */}
        {productCategories.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Browse by category
              </span>
              <HelpTip
                label={`Help: ${niche.itemNounPlural.toLowerCase()} category filters`}
                text="One category pill per shelf your store actually stocks, with how many items are in it. Tap a pill to see only that category, tap it again (or use Clear filters) to go back to everything."
              />
            </div>
            <div
              className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
              role="group"
              aria-label={`Filter ${niche.itemNounPlural.toLowerCase()} by category`}
            >
              <CategoryPill
                label="All"
                count={products.length}
                active={category === ALL_CATEGORIES}
                onClick={() => selectCategory(ALL_CATEGORIES)}
              />
              {productCategories.map((c) => (
                <CategoryPill
                  key={c.name}
                  label={c.name}
                  count={c.count}
                  active={category === c.name}
                  // Tapping the selected pill again clears the filter.
                  onClick={() =>
                    selectCategory(category === c.name ? ALL_CATEGORIES : c.name)
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Result count: matches / total, plus how much is behind "Show more". */}
        {products.length > 0 && !loading && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <p
                className="text-xs text-zinc-500 dark:text-zinc-400"
                role="status"
                aria-live="polite"
              >
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {filteredProducts.length} / {products.length}
                </span>{' '}
                {niche.itemNounPlural.toLowerCase()}
                {category !== ALL_CATEGORIES && ` in ${category}`}
                {visibleProducts.length < filteredProducts.length &&
                  ` · ${visibleProducts.length} shown`}
              </p>
              <HelpTip
                label="Help: Result count"
                text={`The first number is how many ${niche.itemNounPlural.toLowerCase()} match the current search and category; the second is how many the store has in total. When the grid is paged it also shows how many are currently on screen.`}
              />
            </div>
            {isFiltered && (
              <button
                onClick={clearFilters}
                className="shrink-0 text-xs text-emerald-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 h-24"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleProducts.map((p) => {
              const outOfStock = niche.trackStock && (p.stock || 0) <= 0;
              return (
                <button
                  key={p.id}
                  disabled={outOfStock}
                  onClick={() => addToCart(p)}
                  aria-label={`${p.name}, ${fmtMoney(p.salePrice)}${outOfStock ? ', out of stock' : ''}`}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    outOfStock
                      ? 'opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 active:scale-[0.98]'
                  }`}
                >
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-emerald-500 font-bold mt-1">{fmtMoney(p.salePrice)}</p>
                  {niche.trackStock && (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {outOfStock ? 'Out of stock' : `${p.stock} in stock`}
                    </p>
                  )}
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <p className="col-span-full text-sm text-zinc-500 py-10 text-center">
                {emptyMessage}
              </p>
            )}
          </div>
        )}

        {/* Next batch of the paged grid */}
        {remainingCount > 0 && !loading && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-semibold hover:border-emerald-500 hover:text-emerald-500 transition-all"
              >
                Show more
                <ChevronDown className="w-4 h-4" />
              </button>
              <HelpTip
                label="Help: Load next batch"
                text="The register loads 48 items at a time so a large store still opens instantly. This button brings in the next 48 without changing the search or category filter."
              />
            </div>
            <span className="text-xs text-zinc-500">
              {remainingCount} more {niche.itemNounPlural.toLowerCase()}
            </span>
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="w-full lg:w-96 shrink-0">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">
              Current Sale{itemCount > 0 && (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  ({itemCount} item{itemCount !== 1 ? 's' : ''})
                </span>
              )}
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => setShowVoidConfirm(true)}
                className="text-xs text-red-500 hover:underline"
              >
                Void all
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">
              Tap {niche.itemNounPlural.toLowerCase()} to add them to the sale.
            </p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-zinc-500">{fmtMoney(item.salePrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(item.id, item.qty - 1)}
                      className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:text-emerald-500"
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.qty + 1)}
                      className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:text-emerald-500"
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-500"
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Payment method */}
          <div className="mt-5">
            <p className="text-xs font-medium text-zinc-500 mb-2">Payment method</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Payment method">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={paymentMethod === m}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 px-2 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    paymentMethod === m
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-sm text-zinc-500">Total</span>
            <span className="text-2xl font-bold">{fmtMoney(totalAmount)}</span>
          </div>

          <button
            onClick={completeSale}
            disabled={isCompleting || cart.length === 0}
            className="w-full mt-4 px-4 py-3.5 rounded-2xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 disabled:opacity-40 active:scale-[0.99] transition-all"
          >
            {isCompleting ? 'Completing...' : 'Complete Sale'}
          </button>

          <button
            onClick={printLastReceipt}
            disabled={!lastSale}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:border-emerald-500 disabled:opacity-40 transition-all"
          >
            <Printer className="w-4 h-4" /> Print last receipt
          </button>
        </div>
      </div>

      {/* Quick add for an unknown scanned barcode */}
      {quickAddBarcode !== null && (
        <QuickAddProduct
          barcode={quickAddBarcode}
          storeId={storeId}
          store={store}
          niche={niche}
          categories={categories}
          // So a generated code (blank SKU field) can't clash with the catalogue.
          existingSkus={products.map((p) => p.sku)}
          onCreated={handleQuickAddCreated}
          onCancel={closeQuickAdd}
        />
      )}

      {/* Void confirmation dialog */}
      <ConfirmDialog
        open={showVoidConfirm}
        title="Void entire transaction?"
        message={`This will remove all ${itemCount} item${itemCount !== 1 ? 's' : ''} (${fmtMoney(totalAmount)}) from the current sale.`}
        confirmLabel="Void transaction"
        variant="danger"
        onConfirm={voidTransaction}
        onCancel={() => setShowVoidConfirm(false)}
      />
    </div>
  );
}

/**
 * One scrollable category pill in the POS filter row. The count lives in its
 * own span so the label never stretches the pill when a category name is long.
 */
function CategoryPill({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active
          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-emerald-500 hover:text-zinc-900 dark:hover:text-white'
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
          active
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
