// src/pages/Onboarding.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import {
  doc,
  setDoc,
  collection,
  writeBatch,
} from 'firebase/firestore';

const BUSINESS_TYPES = [
  { value: 'supermarket', label: 'Supermarket / Minimart' },
  { value: 'bags_shoes', label: 'Bags & Shoes / Boutique' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'restaurant', label: 'Restaurant / Bar' },
  { value: 'other', label: 'Other' },
];

const SUPER_MARKET_DEFAULT_CATEGORIES = [
  'Beverages',
  'Snacks & Confectionery',
  'Food Cupboard & Dry Foods',
  'Fresh & Frozen',
  'Toiletries & Personal Care',
  'Household & Cleaning',
  'Baby & Kids',
];

const BAGS_SHOES_DEFAULT_CATEGORIES = [
  'Ladies Handbags',
  'Men’s Shoes',
  'Ladies Shoes',
  'School Bags & Backpacks',
  'Travel Bags & Boxes',
  'Slippers & Sandals',
  'Kids Shoes',
  'Accessories (Belts, Wallets, Caps)',
];

const GENERAL_DEFAULT_CATEGORIES = [
  'General Merchandise',
  'Accessories',
  'Services',
];

function getDefaultCategoriesForType(type) {
  if (type === 'supermarket') return SUPER_MARKET_DEFAULT_CATEGORIES;
  if (type === 'bags_shoes') return BAGS_SHOES_DEFAULT_CATEGORIES;
  return GENERAL_DEFAULT_CATEGORIES;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, storeId, store, storeName, storeType, loading } = useAuth();

  const [step, setStep] = useState(1);
  const [name, setName] = useState(storeName || '');
  const [businessType, setBusinessType] = useState(
    store?.onboarding?.businessType || storeType || 'supermarket'
  );
  const [saving, setSaving] = useState(false);

  const initialSuggested = getDefaultCategoriesForType(
    store?.onboarding?.businessType || storeType || 'supermarket'
  );

  const [selectedCategories, setSelectedCategories] = useState(
    initialSuggested
  );
  const [customCategory, setCustomCategory] = useState('');

  useEffect(() => {
    const newDefaults = getDefaultCategoriesForType(businessType);
    setSelectedCategories(newDefaults);
  }, [businessType]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-200 text-sm">
        Loading…
      </div>
    );
  }

  if (!storeId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-200 text-sm px-4 text-center">
        No store found. Please log out and log in again.
      </div>
    );
  }

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleAddCustomCategory = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) return;
    if (!selectedCategories.includes(trimmed)) {
      setSelectedCategories((prev) => [...prev, trimmed]);
    }
    setCustomCategory('');
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleFinish = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);

      const storeRef = doc(db, 'stores', storeId);

      await setDoc(
        storeRef,
        {
          name: name.trim(),
          type: businessType,
          onboarding: {
            ...(store?.onboarding || {}),
            businessType,
            storeProfileDone: true,
            categoriesDone: true,
            firstProductAdded:
              store?.onboarding?.firstProductAdded || false,
            firstSaleCompleted:
              store?.onboarding?.firstSaleCompleted || false,
            completed: false,
          },
          ownerUid: user?.uid || null,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      if (selectedCategories.length > 0) {
        const batch = writeBatch(db);
        const catCol = collection(db, 'categories');

        selectedCategories.forEach((catName) => {
          const ref = doc(catCol);
          batch.set(ref, {
            name: catName,
            storeId,
            createdAt: new Date(),
          });
        });

        await batch.commit();
      }

      navigate('/onboarding', { replace: true });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not complete onboarding.');
    } finally {
      setSaving(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6 text-xs text-zinc-400">
      <div
        className={`flex items-center gap-1 ${
          step === 1 ? 'text-emerald-400' : ''
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
            step === 1
              ? 'bg-emerald-500 text-black'
              : 'bg-zinc-700 text-zinc-200'
          }`}
        >
          1
        </span>
        <span>Business</span>
      </div>
      <span className="text-zinc-600">•</span>
      <div
        className={`flex items-center gap-1 ${
          step === 2 ? 'text-emerald-400' : ''
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
            step === 2
              ? 'bg-emerald-500 text-black'
              : 'bg-zinc-700 text-zinc-200'
          }`}
        >
          2
        </span>
        <span>Categories</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">
        {renderStepIndicator()}

        {step === 1 && (
          <>
            <h1 className="text-2xl font-semibold text-white mb-2">
              Set up your business
            </h1>
            <p className="text-sm text-zinc-400 mb-6">
              Tell SmartStore what you run so we can set things up for you.
            </p>

            <form onSubmit={handleNext} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Business name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Divine Grace Supermarket"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Type of business
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
                >
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={!name.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-400 rounded-2xl py-3 text-sm font-semibold mt-2"
              >
                Continue
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-semibold text-white mb-2">
              Choose your main categories
            </h1>
            <p className="text-sm text-zinc-400 mb-4">
              We&apos;ll create these categories for you so you can start
              adding products immediately.
            </p>

            <form onSubmit={handleFinish} className="space-y-4">
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 -mr-1">
                {getDefaultCategoriesForType(businessType).map((cat) => (
                  <label
                    key={cat}
                    className="flex items-center gap-2 text-sm text-zinc-100 bg-zinc-800/60 rounded-2xl px-3 py-2 cursor-pointer hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      className="rounded bg-zinc-900 border-zinc-600 text-emerald-500"
                      checked={selectedCategories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    <span>{cat}</span>
                  </label>
                ))}

                {selectedCategories
                  .filter(
                    (c) =>
                      !getDefaultCategoriesForType(
                        businessType
                      ).includes(c)
                  )
                  .map((cat) => (
                    <label
                      key={cat}
                      className="flex items-center gap-2 text-sm text-zinc-100 bg-zinc-800/60 rounded-2xl px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="rounded bg-zinc-900 border-zinc-600 text-emerald-500"
                        checked={selectedCategories.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                      />
                      <span>{cat}</span>
                    </label>
                  ))}
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Add another category (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) =>
                      setCustomCategory(e.target.value)
                    }
                    placeholder="e.g. Cosmetics, Electronics"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCategory}
                    className="px-3 py-2.5 text-xs rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2 rounded-2xl text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  {saving ? 'Finishing…' : 'Finish setup'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}