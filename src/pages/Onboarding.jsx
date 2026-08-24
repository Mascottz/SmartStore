// src/pages/Onboarding.jsx
// Business setup wizard: name → niche → categories → create store.
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Plus, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/backend';
import { NICHES, getNiche } from '../config/niches';
import SplashScreen from '../components/SplashScreen';
import logo from '/logo-smartstore.png';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, store, loading, refreshMembership } = useAuth();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('supermarket');
  const [selectedCategories, setSelectedCategories] = useState(
    getNiche('supermarket').categories
  );
  const [customCategory, setCustomCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedCategories(getNiche(businessType).categories);
  }, [businessType]);

  if (loading) return <SplashScreen />;
  if (store) return <Navigate to="/" replace />;

  const niche = getNiche(businessType);

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const addCustomCategory = () => {
    const cat = customCategory.trim();
    if (!cat) return;
    if (!selectedCategories.includes(cat)) {
      setSelectedCategories((prev) => [...prev, cat]);
    }
    setCustomCategory('');
  };

  const handleFinish = async () => {
    if (!name.trim()) {
      toast.error('Please give your business a name.');
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      await api.stores.create(user.id, user.email, {
        name: name.trim(),
        type: businessType,
        categories: selectedCategories,
      });
      await refreshMembership();
      toast.success(`${name.trim()} is ready`);
      navigate('/', { replace: true });
    } catch (e) {
      console.error(e);
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
          <div className="flex justify-center gap-2 mt-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 w-16 rounded-full ${
                  s <= step ? 'bg-emerald-500' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 md:p-8">
          {/* STEP 1: name */}
          {step === 1 && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                What is your business called?
              </label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mama Nkechi Supermart"
                className="w-full px-4 py-3.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    if (!name.trim()) return toast.error('Enter your business name first.');
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {NICHES.map((n) => {
                  const Icon = n.icon;
                  const active = businessType === n.value;
                  return (
                    <button
                      key={n.value}
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
                      className={`px-4 py-2 rounded-full text-sm border transition-all ${
                        active
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-700 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {active ? '✓ ' : ''}
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
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-sm"
                />
                <button
                  onClick={addCustomCategory}
                  className="px-4 py-2.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white"
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
                  {saving ? 'Creating…' : 'Finish Setup'} <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
