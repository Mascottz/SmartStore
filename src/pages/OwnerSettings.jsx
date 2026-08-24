// src/pages/OwnerSettings.jsx
import { useEffect, useState } from 'react';
import { Save, Plus, X, Moon, Sun, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { NICHES } from '../config/niches';

export default function OwnerSettings() {
  const { storeId, store, theme, toggleTheme } = useAuth();

  const [name, setName] = useState(store?.name || '');
  const [type, setType] = useState(store?.type || 'other');
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    setName(store?.name || '');
    setType(store?.type || 'other');
  }, [store]);

  const { data: categories } = useStoreData(
    () => (storeId ? api.categories.list(storeId) : []),
    [storeId]
  );

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Store name cannot be empty.');
    setSaving(true);
    try {
      await api.stores.update(storeId, { name: name.trim(), type });
      toast.success('Store settings saved');
    } catch (e) {
      toast.error(e.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    const cat = newCategory.trim();
    if (!cat) return;
    if (categories.some((c) => c.name.toLowerCase() === cat.toLowerCase())) {
      return toast.error('That category already exists.');
    }
    try {
      await api.categories.add(storeId, cat);
      setNewCategory('');
      toast.success('Category added');
    } catch (e) {
      toast.error(e.message || 'Could not add category.');
    }
  };

  const removeCategory = async (c) => {
    if (!window.confirm(`Remove category "${c.name}"?`)) return;
    try {
      await api.categories.remove(c.id);
      toast.success('Category removed');
    } catch (e) {
      toast.error(e.message || 'Could not remove category.');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Owner Settings</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Manage your store details, categories and appearance
        </p>
      </div>

      {/* Store details */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 mb-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Store className="w-4 h-4 text-emerald-500" /> Store details
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">
              Store name
            </label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">
              Business type
            </label>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {NICHES.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              Changing type updates terminology and niche features (e.g. expiry
              tracking for pharmacies).
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 mb-6">
        <h3 className="font-semibold mb-4">Categories</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm"
            >
              {c.name}
              <button
                onClick={() => removeCategory(c)}
                className="text-zinc-400 hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          {categories.length === 0 && (
            <p className="text-xs text-zinc-500">No categories yet.</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className={inputCls + ' flex-1'}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="New category name..."
          />
          <button
            onClick={addCategory}
            className="px-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:text-emerald-500"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Appearance</h3>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:border-emerald-500"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4" /> Switch to light mode
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" /> Switch to dark mode
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-emerald-500 text-sm';
