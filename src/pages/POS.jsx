// src/pages/POS.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Printer, Camera, Minus, Plus, Search, Keyboard } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { useDebounce } from '../hooks/useDebounce';
import { useKeyboard } from '../hooks/useKeyboard';
import { api } from '../lib/backend';
import { fmtMoney } from '../lib/format';
import { sanitize } from '../lib/validate';
import ConfirmDialog from '../components/ConfirmDialog';

const PAYMENT_METHODS = ['Cash', 'Transfer', 'POS/Card'];

export default function POS() {
  const { storeId, user, niche, store, storeName, firstSaleCompleted } = useAuth();

  const { data: products, loading } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );

  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [isScanning, setIsScanning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const scannerRef = useRef(null);
  const searchRef = useRef(null);
  const productsRef = useRef(products);
  productsRef.current = products;

  const debouncedSearch = useDebounce(searchTerm, 200);

  const filteredProducts = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term)
    );
  }, [products, debouncedSearch]);

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

  // Barcode scanner
  useEffect(() => {
    if (!isScanning) return;

    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      (decodedText) => {
        const text = decodedText.toLowerCase();
        const product = productsRef.current.find(
          (p) =>
            (p.sku || '').toLowerCase() === text ||
            p.name.toLowerCase().includes(text)
        );
        if (product) addToCart(product);
        else toast.error(`No product found for barcode: ${decodedText}`);
      },
      () => {}
    );

    scannerRef.current = scanner;
    return () => {
      scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, [isScanning, addToCart]);

  const completeSaleRef = useRef(completeSale);
  completeSaleRef.current = completeSale;
  const printLastReceiptRef = useRef(printLastReceipt);
  printLastReceiptRef.current = printLastReceipt;

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () => ({
      Escape: () => {
        if (isScanning) setIsScanning(false);
        else if (showShortcuts) setShowShortcuts(false);
        else if (showVoidConfirm) setShowVoidConfirm(false);
        else setSearchTerm('');
      },
      F2: () => searchRef.current?.focus(),
      'Ctrl+Enter': () => {
        if (cart.length > 0 && !isCompleting) completeSaleRef.current();
      },
      'Ctrl+P': () => {
        if (lastSale) printLastReceiptRef.current();
      },
    }),
    [isScanning, showShortcuts, showVoidConfirm, cart.length, isCompleting, lastSale]
  );
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

  const printLastReceipt = () => {
    if (!lastSale) return toast.error('No completed sale to print yet.');

    const { receiptNo, createdAt, items, total, paymentMethod: method } = lastSale;
    const rows = items
      .map(
        (i) =>
          `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${fmtMoney(
            i.price * i.qty
          )}</td></tr>`
      )
      .join('');

    const win = window.open('', '_blank');
    if (!win) return toast.error('Pop-up blocked. Please allow pop-ups for receipts.');
    win.document.write(`
      <html>
        <head><title>${storeName} Receipt</title></head>
        <body style="font-family: 'Courier New', monospace; padding: 30px; max-width: 400px; margin: 0 auto;">
          <h2 style="text-align:center">${storeName}</h2>
          <p style="text-align:center">Powered by SmartStore NG</p>
          <hr/>
          <p><strong>Receipt #:</strong> ${receiptNo}</p>
          <p><strong>Date:</strong> ${new Date(createdAt).toLocaleString('en-NG')}</p>
          <p><strong>Payment:</strong> ${method}</p>
          <hr/>
          <table style="width:100%; font-size: 13px;">
            <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <hr/>
          <h3 style="text-align:right">TOTAL: ${fmtMoney(total)}</h3>
          <p style="text-align:center; margin-top: 20px;">Thank you for your patronage!</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="p-4 md:p-6 flex flex-col lg:flex-row gap-6 min-h-screen">
      {/* Product grid */}
      <div className="flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold flex-1">POS Register</h1>
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
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">Esc</kbd> Clear search / close</span>
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
        </div>

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
            {filteredProducts.map((p) => {
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
                {debouncedSearch
                  ? `No ${niche.itemNounPlural.toLowerCase()} found for "${debouncedSearch}".`
                  : `No ${niche.itemNounPlural.toLowerCase()} yet. Add some from Inventory.`}
              </p>
            )}
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
