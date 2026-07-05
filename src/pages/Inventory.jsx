// src/pages/Inventory.jsx
import { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../context/AuthContext';
import OwnerFeatureGate from '../components/OwnerFeatureGate'; // ✅ NEW

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState('');
  const { products, loading } = useProducts();
  const { storeId } = useAuth();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    costPrice: '',
    salePrice: '',
    stock: '',
    category: '',
  });
  const [editProduct, setEditProduct] = useState(null);

  // NEW: sort state
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'sku' | 'stock'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

  // Filter + sort products (free + owner)
  const filteredProducts = useMemo(() => {
    let list = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    list = [...list].sort((a, b) => {
      let aVal;
      let bVal;

      if (sortBy === 'sku') {
        aVal = (a.sku || '').toString();
        bVal = (b.sku || '').toString();
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      }

      if (sortBy === 'stock') {
        aVal = Number(a.stock || 0);
        bVal = Number(b.stock || 0);
        const cmp = aVal - bVal;
        return sortDir === 'asc' ? cmp : -cmp;
      }

      // default: name
      aVal = (a.name || '').toString();
      bVal = (b.name || '').toString();
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [products, searchTerm, sortBy, sortDir]);

  // Owner-only live stats
  const lowStockItems = useMemo(
    () => products.filter((p) => (p.stock || 0) < 50),
    [products]
  );

  const totalStockValue = useMemo(() => {
    if (!products.length) return 0;
    return products.reduce((sum, p) => {
      const cost = Number(p.costPrice) || 0;
      const stock = Number(p.stock) || 0;
      return sum + cost * stock;
    }, 0);
  }, [products]);

  const avgMarginPercent = useMemo(() => {
    if (!products.length) return 0;
    const margins = products
      .map((p) => {
        const cost = Number(p.costPrice) || 0;
        const sale = Number(p.salePrice) || 0;
        if (!cost || !sale || sale <= cost) return null;
        return ((sale - cost) / cost) * 100;
      })
      .filter((v) => v !== null);

    if (!margins.length) return 0;
    const total = margins.reduce((sum, m) => sum + m, 0);
    return total / margins.length;
  }, [products]);

  const lastUpdatedLabel = useMemo(() => {
    if (!products.length) return 'No products yet';

    const withTime = products.filter(
      (p) => p.updatedAt || p.createdAt
    );

    if (!withTime.length) return 'Just now';

    const latest = withTime.reduce((latestSoFar, p) => {
      const ts = p.updatedAt || p.createdAt;
      if (!latestSoFar) return ts;
      return ts.toMillis() > latestSoFar.toMillis() ? ts : latestSoFar;
    }, null);

    if (!latest) return 'Just now';

    const date = new Date(latest.toMillis());
    return date.toLocaleString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, [products]);

  // ACTIONS

  const addNewProduct = async () => {
    if (!newProduct.name || !newProduct.sku) {
      toast.error('Name and SKU are required');
      return;
    }

    if (!storeId) {
      toast.error('Store not ready yet. Please wait a second and try again.');
      return;
    }

    try {
      await addDoc(collection(db, 'products'), {
        storeId,
        name: newProduct.name,
        sku: newProduct.sku,
        category: newProduct.category || 'General',
        costPrice: Number(newProduct.costPrice || 0),
        salePrice: Number(newProduct.salePrice || 0),
        stock: Number(newProduct.stock || 0),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Clear form
      setNewProduct({
        name: '',
        sku: '',
        costPrice: '',
        salePrice: '',
        stock: '',
        category: '',
      });

      toast.success('Product added successfully');
    } catch (err) {
      console.error(err);
      toast.error('Could not add product');
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Delete this product?')) return;

    try {
      await deleteDoc(doc(db, 'products', id));
      toast.success('Product deleted');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete product');
    }
  };

  const openEditModal = (product) => {
    setEditProduct({
      id: product.id,
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      costPrice: product.costPrice || 0,
      salePrice: product.salePrice || 0,
      stock: product.stock || 0,
    });
    setShowEditModal(true);
  };

  const handleEditChange = (field, value) => {
    setEditProduct((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveEditedProduct = async () => {
    if (!editProduct || !editProduct.id) return;

    if (!editProduct.name || !editProduct.sku) {
      toast.error('Name and SKU are required');
      return;
    }

    try {
      const ref = doc(db, 'products', editProduct.id);
      await updateDoc(ref, {
        name: editProduct.name,
        sku: editProduct.sku,
        category: editProduct.category || 'General',
        costPrice: Number(editProduct.costPrice || 0),
        salePrice: Number(editProduct.salePrice || 0),
        stock: Number(editProduct.stock || 0),
        updatedAt: serverTimestamp(),
      });

      setShowEditModal(false);
      setEditProduct(null);
      toast.success('Product updated');
    } catch (err) {
      console.error(err);
      toast.error('Could not update product');
    }
  };

  return (
    <div className="p-6 bg-zinc-950 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">Inventory Ledger</h1>
          <p className="text-zinc-400">
            Total SKUs: {products.length}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 px-6 py-3 rounded-2xl flex items-center gap-3 font-medium"
        >
          <Plus className="w-5 h-5" /> Add New Product
        </button>
      </div>

      {/* Owner-only live stats */}
      <OwnerFeatureGate>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-zinc-900 rounded-3xl p-6">
            <div className="text-emerald-400 text-sm">TOTAL STOCK VALUE</div>
            <div className="text-3xl font-bold mt-2">
              ₦{totalStockValue.toLocaleString()}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Based on cost price × stock
            </p>
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6">
            <div className="text-amber-400 text-sm">LOW STOCK ITEMS</div>
            <div className="text-3xl font-bold mt-2 text-amber-400">
              {lowStockItems.length}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Items below 50 units</p>
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6">
            <div className="text-zinc-400 text-sm">AVG. MARGIN</div>
            <div className="text-3xl font-bold mt-2">
              {avgMarginPercent ? `${avgMarginPercent.toFixed(1)}%` : '--'}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              From cost vs selling price
            </p>
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6">
            <div className="text-emerald-400 text-sm">LAST UPDATED</div>
            <div className="text-xl font-medium mt-2">{lastUpdatedLabel}</div>
            <p className="text-xs text-zinc-500 mt-1">
              Last time inventory changed
            </p>
          </div>
        </div>
      </OwnerFeatureGate>

      {/* Search + Sort (free) */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-5 top-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by product name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 pl-12 py-4 rounded-3xl focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-sm rounded-2xl px-3 py-2"
          >
            <option value="name">Name</option>
            <option value="sku">SKU</option>
            <option value="stock">Total units</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="bg-zinc-900 border border-zinc-700 text-xs rounded-2xl px-3 py-2"
          >
            {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>
      </div>

      {/* Product table (free) */}
      <div className="bg-zinc-900 rounded-3xl overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr className="text-left text-sm text-zinc-400">
              <th className="p-6 font-medium">PRODUCT</th>
              <th className="p-6 font-medium">SKU</th>
              <th className="p-6 font-medium">CATEGORY</th>
              <th className="p-6 font-medium text-right">COST PRICE</th>
              <th className="p-6 font-medium text-right">SALE PRICE</th>
              <th className="p-6 font-medium text-right">STOCK</th>
              <th className="p-6 font-medium text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="p-6 text-center text-zinc-500">
                  Loading products…
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-zinc-800 hover:bg-zinc-800/50 transition"
                >
                  <td className="p-6 font-medium">{product.name}</td>
                  <td className="p-6 text-zinc-400 font-mono">
                    {product.sku}
                  </td>
                  <td className="p-6 text-zinc-400">
                    {product.category || 'General'}
                  </td>
                  <td className="p-6 text-right">
                    ₦{Number(product.costPrice).toLocaleString()}
                  </td>
                  <td className="p-6 text-right font-medium">
                    ₦{Number(product.salePrice).toLocaleString()}
                  </td>
                  <td className="p-6 text-right">
                    <span
                      className={`${
                        (product.stock || 0) < 50
                          ? 'text-red-400'
                          : 'text-emerald-400'
                      } font-medium`}
                    >
                      {product.stock} units
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <button
                      onClick={() => openEditModal(product)}
                      className="text-blue-400 hover:text-blue-300 mr-4"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteProduct(product.id)}
                      className="text-red-400 hover:text-red-500"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-3xl p-8 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Add New Product</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              <input
                type="text"
                placeholder="Product Name"
                value={newProduct.name}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, name: e.target.value })
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
              <input
                type="text"
                placeholder="SKU / Barcode"
                value={newProduct.sku}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, sku: e.target.value })
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
              <input
                type="text"
                placeholder="Category (e.g. Drinks, Snacks)"
                value={newProduct.category}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, category: e.target.value })
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Cost Price (₦)"
                  value={newProduct.costPrice}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      costPrice: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
                />
                <input
                  type="number"
                  placeholder="Sale Price (₦)"
                  value={newProduct.salePrice}
                  onChange={(e) =>
                    setNewProduct({
                      ...newProduct,
                      salePrice: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
                />
              </div>
              <input
                type="number"
                placeholder="Initial Stock"
                value={newProduct.stock}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, stock: e.target.value })
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-4 border border-zinc-700 rounded-2xl"
              >
                Close
              </button>
              <button
                onClick={addNewProduct}
                className="flex-1 py-4 bg-emerald-600 rounded-2xl font-semibold"
              >
                Save & Add Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditModal && editProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-3xl p-8 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Edit Product</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              <input
                type="text"
                placeholder="Product Name"
                value={editProduct.name}
                onChange={(e) => handleEditChange('name', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
              <input
                type="text"
                placeholder="SKU / Barcode"
                value={editProduct.sku}
                onChange={(e) => handleEditChange('sku', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
              <input
                type="text"
                placeholder="Category"
                value={editProduct.category}
                onChange={(e) =>
                  handleEditChange('category', e.target.value)
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Cost Price (₦)"
                  value={editProduct.costPrice}
                  onChange={(e) =>
                    handleEditChange('costPrice', e.target.value)
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
                />
                <input
                  type="number"
                  placeholder="Sale Price (₦)"
                  value={editProduct.salePrice}
                  onChange={(e) =>
                    handleEditChange('salePrice', e.target.value)
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
                />
              </div>
              <input
                type="number"
                placeholder="Stock units"
                value={editProduct.stock}
                onChange={(e) =>
                  handleEditChange('stock', e.target.value)
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
              />
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-4 border border-zinc-700 rounded-2xl"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedProduct}
                className="flex-1 py-4 bg-emerald-600 rounded-2xl font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}