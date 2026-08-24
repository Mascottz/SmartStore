// src/pages/Pricing.jsx
import { Check, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const FREE_FEATURES = [
  'POS Register & receipts',
  'Inventory management',
  'Sales history',
  'Up to 3 team members',
];

const OWNER_FEATURES = [
  'Everything in Shop Mode',
  'Full sales & profit reports',
  'Expense analytics',
  'Void audit trail',
  'Monthly revenue dashboard',
  'Unlimited team members',
];

export default function Pricing() {
  const { plan, upgradeToOwner } = useAuth();
  const navigate = useNavigate();
  const isOwnerMode = plan === 'owner';

  const handleUpgrade = async () => {
    try {
      await upgradeToOwner();
      toast.success('Welcome to Owner Mode');
      navigate('/');
    } catch (e) {
      toast.error(e.message || 'Could not upgrade.');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold">Simple pricing for growing shops</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Start free at the counter. Upgrade when you want the full picture.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Free */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-7">
          <h3 className="font-bold text-lg">Shop Mode</h3>
          <p className="text-3xl font-bold mt-2">
            ₦0<span className="text-sm font-normal text-zinc-500">/month</span>
          </p>
          <ul className="mt-6 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <button
            disabled
            className="w-full mt-8 px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-400"
          >
            {isOwnerMode ? 'Included' : 'Current plan'}
          </button>
        </div>

        {/* Owner */}
        <div className="relative bg-white dark:bg-zinc-900 border-2 border-emerald-500 rounded-3xl p-7">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-black text-xs font-bold flex items-center gap-1">
            <Crown className="w-3 h-3" /> RECOMMENDED
          </span>
          <h3 className="font-bold text-lg">Owner Mode</h3>
          <p className="text-3xl font-bold mt-2">
            ₦5,000<span className="text-sm font-normal text-zinc-500">/month</span>
          </p>
          <ul className="mt-6 space-y-3">
            {OWNER_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpgrade}
            disabled={isOwnerMode}
            className="w-full mt-8 px-4 py-3 rounded-2xl bg-emerald-500 text-black text-sm font-bold hover:bg-emerald-400 disabled:opacity-50"
          >
            {isOwnerMode ? 'You are on Owner Mode' : 'Upgrade to Owner Mode'}
          </button>
          {!isOwnerMode && (
            <p className="text-[11px] text-zinc-500 text-center mt-2">
              Demo billing, connect Paystack/Flutterwave for production.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
