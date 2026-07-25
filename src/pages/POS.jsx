// src/pages/POS.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Printer, X, Camera, Barcode } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import toast from 'react-hot-toast';
import { useProducts } from '../hooks/useProducts';
import { db } from '../firebase';
import {
  collection,
  serverTimestamp,
  runTransaction,
  doc,
  setDoc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export default function POS() {
  const { products, loading } = useProducts();
  const { storeId, firstSaleCompleted, store } = useAuth();
  const navigate = useNavigate();

  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [isScanning, setIsScanning] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  const scannerRef = useRef(null);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        )
      );
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
    toast.success(`${product.name} added`);
  };

  useEffect(() => {
    let scanner;

    if (isScanning) {
      scanner = new Html5QrcodeScanner(
        'reader',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          const text = decodedText.toLowerCase();
          const product = products.find(
            (p) =>
              (p.sku || '').toLowerCase() === text ||
              p.name.toLowerCase().includes(text)
          );

          if (product) {
            addToCart(product);
            toast.success(`Scanned: ${product.name}`);
          } else {
            toast.error(`No product found for barcode: ${decodedText}`);
          }
        },
        () => {}
      );

      scannerRef.current = scanner;
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, [isScanning, products]);

  const toggleScanner = () => {
    setIsScanning(!isScanning);
  };

  const updateQuantity = (id, newQty) => {
    if (newQty < 1) return;
    setCart(
      cart.map((item) => (item.id === id ? { ...item, qty: newQty } : item))
    );
  };

  const removeFromCart = (id) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const voidTransaction = () => {
    if (cart.length === 0) return;
    if (window.confirm('Void entire transaction?')) {
      setCart([]);
      toast.success('Transaction voided');
    }
  };

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.salePrice * item.qty,
    0
  );

  const completeSale = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');

    if (!storeId) {
      return toast.error(
        'Store not ready yet. Please wait a second and try again.'
      );
    }

    const receiptNo = 'SM-' + Date.now().toString().slice(-8);

    try {
      setIsCompleting(true);

      const saleResult = await runTransaction(db, async (transaction) => {
        const productSnaps = [];
        for (const item of cart) {
          const productRef = doc(db, 'products', item.id);
          const snap = await transaction.get(productRef);
          if (!snap.exists()) {
            throw new Error(`Product not found: ${item.name}`);
          }
          productSnaps.push({ item, ref: productRef, snap });
        }

        for (const { item, snap } of productSnaps) {
          const currentStock = snap.data().stock ?? 0;
          const newStock = currentStock - item.qty;
          if (newStock < 0) {
            throw new Error(`Insufficient stock for ${item.name}`);
          }
        }

        for (const { item, ref, snap } of productSnaps) {
          const currentStock = snap.data().stock ?? 0;
          const newStock = currentStock - item.qty;
          transaction.update(ref, { stock: newStock });
        }

        const saleRef = doc(collection(db, 'sales'));
        transaction.set(saleRef, {
          storeId,
          createdAt: serverTimestamp(),
          total: totalAmount,
          paymentMethod,
          receiptNo,
          status: 'completed',
          items: cart.map((item) => ({
            productId: item.id,
            name: item.name,
            qty: item.qty,
            price: item.salePrice,
            lineTotal: item.salePrice * item.qty,
          })),
        });

        return { id: saleRef.id };
      });

      const saleForPrint = {
        id: saleResult.id,
        receiptNo,
        createdAt: new Date(),
        paymentMethod,
        items: cart.map((item) => ({
          name: item.name,
          qty: item.qty,
          price: item.salePrice,
        })),
        total: totalAmount,
      };
      setLastSale(saleForPrint);

      setCart([]);
      toast.success(`Sale completed via ${paymentMethod}.`);

      try {
  if (!firstSaleCompleted && storeId) {
    const storeRef = doc(db, 'stores', storeId);
    await setDoc(
      storeRef,
      {
        onboarding: {
          ...(store?.onboarding || {}),
          firstSaleCompleted: true,
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );
  }
} catch (e) {
  console.error(
    'Could not update onboarding flag for first sale',
    e
  );
}
      navigate('/onboarding');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not complete sale');
    } finally {
      setIsCompleting(false);
    }
  };

  const printLastReceipt = () => {
    if (!lastSale) {
      return toast.error('No completed sale to print yet.');
    }

    const { receiptNo, createdAt, items, total } = lastSale;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head><title>SmartStore NG • Receipt</title></head>
        <body style="font-family: monospace; padding: 30px; max-width: 400px; margin: 0 auto;">
          <h2 style="text-align:center">SmartStore NG</h2>
          <p style="text-align:center">Run Your Store Smarter</p>
          <hr/>
          <p><strong>Receipt #:</strong> ${receiptNo}</p>
          <p><strong>Date:</strong> ${createdAt.toLocaleString('en-NG')}</p>
          <p><strong>Payment:</strong> ${paymentMethod || '—'}</p>
          <hr/>
          ${items
            .map(
              (item) => `
            <div style="margin: 8px 0;">
              ${item.qty} × ${item.name}
              <span style="float:right">₦${(
                item.price * item.qty
              ).toLocaleString()}</span>
            </div>
          `
            )
            .join('')}
          <hr/>
          <h3 style="text-align:right">TOTAL: ₦${total.toLocaleString()}</h3>
          <p style="text-align:center; margin-top: 40px; font-size: 14px;">Thank You! Come Again</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="p-4 md:p-6 bg-zinc-950 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6 md:mb-8">
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
          <Barcode className="w-8 h-8 md:w-9 md:h-9 text-emerald-400" /> POS
          Register
        </h1>
        <div className="text-emerald-400 font-medium text-sm md:text-base text-right">
          MasTech Store • Live
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
        {/* Products / scanner */}
        <div className="lg:col-span-7 bg-zinc-900 rounded-3xl p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-4 md:mb-6">
            <input
              type="text"
              placeholder="Search or Type SKU (Enter to add)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 md:px-5 py-3 md:py-4 focus:outline-none focus:border-emerald-500 text-sm"
            />
            <button
              onClick={toggleScanner}
              className={`w-full sm:w-auto px-4 md:px-6 py-3 rounded-2xl flex items-center justify-center gap-2 font-medium text-sm transition ${
                isScanning
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              <Camera className="w-5 h-5" />
              {isScanning ? 'Stop Scan' : 'Scan Barcode'}
            </button>
          </div>

          {isScanning && (
            <div className="mb-4 md:mb-6 bg-black rounded-2xl overflow-hidden">
              <div id="reader" className="w-full" />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 max-h-[420px] md:max-h-[520px] overflow-auto">
            {loading ? (
              <div className="col-span-2 sm:col-span-3 text-zinc-500 text-sm">
                Loading products…
              </div>
            ) : (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl p-4 md:p-5 text-left active:scale-95 transition"
                >
                  <div className="font-medium text-sm md:text-base">
                    {product.name}
                  </div>
                  <div className="text-emerald-400 text-xl md:text-2xl font-bold mt-2">
                    ₦{Number(product.salePrice).toLocaleString()}
                  </div>
                  <div className="text-xs text-zinc-400 mt-3">
                    SKU: {product.sku} • {product.stock} left
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Cart / checkout */}
        <div className="lg:col-span-5 bg-zinc-900 rounded-3xl p-4 md:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-semibold">
              Current Sale
            </h2>
            <button
              onClick={voidTransaction}
              className="text-red-400 flex items-center gap-1 hover:text-red-500 text-sm"
            >
              <Trash2 className="w-4 h-4" /> Void
            </button>
          </div>

          <div className="flex-1 overflow-auto space-y-3 mb-4 md:mb-6">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm text-center px-4">
                Cart empty. Start scanning or adding items.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-zinc-800 rounded-2xl p-4"
                >
                  <div className="flex-1">
                    <div className="text-sm md:text-base">
                      {item.name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      ₦
                      {Number(item.salePrice).toLocaleString()} each
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex border border-zinc-700 rounded-xl overflow-hidden">
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.qty - 1)
                        }
                        className="px-3 py-1 hover:bg-zinc-700 text-sm"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10);
                          if (!value || value < 1) return;
                          updateQuantity(item.id, value);
                        }}
                        className="w-12 md:w-14 text-center bg-zinc-900 text-sm outline-none"
                      />
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.qty + 1)
                        }
                        className="px-3 py-1 hover:bg-zinc-700 text-sm"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-red-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="font-bold text-sm md:text-base sm:ml-4">
                    ₦
                    {(
                      Number(item.salePrice) * item.qty
                    ).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-zinc-700 pt-4 md:pt-6">
            <div className="mb-3 md:mb-4">
              <p className="text-xs text-zinc-500 mb-2">
                Payment method
              </p>
              <div className="flex gap-2">
                {['Cash', 'Transfer', 'POS'].map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`flex-1 py-2 rounded-2xl text-xs font-medium ${
                      paymentMethod === method
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between text-2xl md:text-3xl font-bold mb-4 md:mb-6">
              <span>Total</span>
              <span>₦{totalAmount.toLocaleString()}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={completeSale}
                disabled={isCompleting || cart.length === 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-zinc-500 py-3 md:py-4 rounded-3xl text-base md:text-lg font-semibold flex items-center justify-center gap-3 transition"
              >
                {isCompleting ? 'Completing...' : 'Complete Sale'}
              </button>

              <button
                onClick={printLastReceipt}
                disabled={!lastSale}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500 py-3 md:py-4 rounded-3xl text-base md:text-lg font-semibold flex items-center justify-center gap-3 transition"
              >
                <Printer className="w-6 h-6" />
                Print Receipt
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Complete sale first, then print the most recent receipt.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}