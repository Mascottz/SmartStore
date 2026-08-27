// src/pages/Onboarding.jsx
// Business setup wizard: name, niche, categories, create store.
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Plus, ArrowRight, ArrowLeft, LogIn, Store, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/backend';
import { NICHES, getNiche } from '../config/niches';
import SplashScreen from '../components/SplashScreen';
import { sanitize, isValidStoreName } from '../lib/validate';
import logo from '/logo-smartstore.png';

// Patterns that indicate the user already owns a store (broad matching
// to handle different backend / RPC error messages).
const ALREADY_HAS_STORE_RE =
  /already\s+(has|have|owns?|exists?)\b.*store|store\s+already\b|duplicate\s+store|one\s+store\s+per/i;

/**
 * Terminal screen for an account that already owns a store: a stale tab, a
 * bookmarked /onboarding link, or a "one store per account" rejection from
 * the backend. Going through the root route keeps RootRoute as the single
 * place that decides where an authenticated user lands, and a full page load
 * sidesteps the StoreOnboardingGuard race with a soft navigate().
 */
function AlreadyHasStore({ storeName }) {
  const go = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <Store className="w-7 h-7 text-emerald-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">
          You already have a store
        </h1>
        <p className="text-zinc-400 text-sm mb-6">
          {storeName ? (
            <>
              <span className="text-zinc-200 font-medium">{storeName}</span> is already
              set up on this account.
            </>
          ) : (
            'This account is already set up with a store.'
          )}{' '}
          Head to your dashboard to keep going — each account can only run one
          store.
        </p>
        <button
          type="button"
          onClick={go}
          className="inline-flex items-center gap-2 w-full justify-center px-6 py-3.5 rounded-2xl bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400"
        >
          <LayoutDashboard className="w-4 h-4" />
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { user, store, loading, refreshMembership } = useAuth();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('supermarket');
  const [selectedCategories, setSelectedCategories] = useState(
    getNiche('supermarket').categories
  );
  const [customCategory, setCustomCategory] = useState('');
  const [saving, setSaving] = useState(false);
  // Set when the backend rejects store creation because the account already
  // owns one, before refreshMembership() has had a chance to surface it.
  const [alreadyHasStore, setAlreadyHasStore] = useState(false);

  useEffect(() => {
    setSelectedCategories(getNiche(businessType).categories);
  }, [businessType]);

  if (loading) return <SplashScreen />;

  // This account already owns a store — a stale tab, a bookmarked
  // /onboarding link, or a redirect that landed here. Show an explicit
  // screen with a working way through instead of a splash that only resolves
  // if an automatic navigation happens to fire. (RootRoute only sends users
  // here when they have no store, so this is the rare edge case; a hard
  // window.location also sidesteps the StoreOnboardingGuard race where a soft
  // navigate() re-renders before AuthContext has updated.)
  if (store) return <AlreadyHasStore storeName={store.name} />;
  if (alreadyHasStore) return <AlreadyHasStore />;

  const niche = getNiche(businessType);

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const addCustomCategory = () => {
    const cat = sanitize(customCategory);
    if (!cat) return;
    if (cat.length > 100) {
      return toast.error('Category name is too long (max 100 characters).');
    }
    if (!selectedCategories.includes(cat)) {
      setSelectedCategories((prev) => [...prev, cat]);
    }
    setCustomCategory('');
  };

  const handleFinish = async () => {
    const cleanName = sanitize(name);
    if (!isValidStoreName(cleanName)) {
      toast.error('Please give your business a name (2 to 100 characters).');
      setStep(1);
      return;
    }
    if (selectedCategories.length === 0) {
      toast.error('Please select at least one category.');
      setStep(3);
      return;
    }

    setSaving(true);
    try {
      await api.stores.create(user.id, user.email, {
        name: cleanName,
        type: businessType,
        categories: selectedCategories,
      });
      await refreshMembership();
      toast.success(`${cleanName} is ready`);
      // Return to the root route so AuthContext re-fetches membership and
      // RootRoute can make the canonical dashboard redirect. A direct
      // /dashboard navigation can race with StoreOnboardingGuard while the
      // new store is still loading.
      window.location.href = '/';
    } catch (e) {
      console.error(e);
      // If the backend says the user already has a store, skip the error
      // toast and show the terminal screen with an explicit way through.
      if (ALREADY_HAS_STORE_RE.test(e.message || '')) {
        // Pull the membership we just failed to create so the screen can name
        // the store; either way the screen is what the user sees next.
        try {
          await refreshMembership();
        } catch {
          // The screen works without a store name too.
        }
        setAlreadyHasStore(true);
        return;
      }
      toast.error(e.message || 'Could not create your store.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="SmartStore NG" className="w-full h-full object-contain" />
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Set up your business
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Step {step} of 3,{' '}
            {step === 1
              ? 'Tell us about your business'
              : step === 2
              ? 'Choose your business type'
              : 'Pick your categories'}
          </p>
          <div className="flex justify-center gap-2 mt-4" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 w-16 rounded-full ${
                  s <= step ? 'bg-emerald-500' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/login';
            }}
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Go back to login
          </button>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 md:p-8">
          {/* STEP 1: name */}
          {step === 1 && (
            <div>
              <label htmlFor="store-name" className="block text-sm font-medium text-zinc-300 mb-2">
                What is your business called?
              </label>
              <input
                id="store-name"
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mama Nkechi Supermart"
                maxLength={100}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) setStep(2);
                }}
                className="w-full px-4 py-3.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    if (!sanitize(name)) return toast.error('Enter your business name first.');
                    setStep(2);
                  }}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: niche picker */}
          {step === 2 && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Business type">
                {NICHES.map((n) => {
                  const Icon = n.icon;
                  const active = businessType === n.value;
                  return (
                    <button
                      key={n.value}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setBusinessType(n.value)}
                      className={`text-left p-4 rounded-2xl border transition-all ${
                        active
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-zinc-700 hover:border-zinc-500'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            active ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${active ? 'text-emerald-400' : 'text-white'}`}>
                            {n.label}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate">{n.tagline}</p>
                        </div>
                        {active && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-zinc-700 text-zinc-300 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: categories */}
          {step === 3 && (
            <div>
              <p className="text-sm text-zinc-400 mb-4">
                We pre-selected common categories for a{' '}
                <span className="text-emerald-400 font-medium">{niche.label}</span>. Tap to
                toggle, or add your own.
              </p>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...niche.categories, ...selectedCategories])].map((cat) => {
                  const active = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      aria-pressed={active}
                      className={`px-4 py-2 rounded-full text-sm border transition-all ${
                        active
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-700 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {active ? '\u2713 ' : ''}
                      {cat}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 mt-4">
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomCategory()}
                  placeholder="Add custom category..."
                  maxLength={100}
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-sm"
                />
                <button
                  onClick={addCustomCategory}
                  className="px-4 py-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white"
                  aria-label="Add custom category"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-zinc-700 text-zinc-300 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Finish Setup'} <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
