// src/pages/Pricing.jsx
import { useMemo, useState } from 'react';
import { Check, Crown, CreditCard, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { initializePayment, isPaystackConfigured, makeReference } from '../lib/paystack';

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

// Paystack amounts are in Naira; the helper converts to kobo internally.
// Owner Mode bills monthly, or yearly at a two-months-free discount. The
// yearly saving is derived so the copy can never drift from the prices.
export const OWNER_PRICE_MONTHLY_NAIRA = 5000;
export const OWNER_PRICE_YEARLY_NAIRA = 50000;
export const OWNER_YEARLY_SAVINGS_NAIRA =
  OWNER_PRICE_MONTHLY_NAIRA * 12 - OWNER_PRICE_YEARLY_NAIRA;

// Reference prefixes so a payment can be traced back to the plan it bought.
const REFERENCE_PREFIX = { monthly: 'SS-MONTHLY', yearly: 'SS-YEARLY' };

const nairaWithCommas = (n) => '\u20A6' + Number(n).toLocaleString('en-NG');

export default function Pricing() {
  const { plan, upgradeToOwner, storeIsDemo, user } = useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'yearly'

  // Live billing requires a valid VITE_PAYSTACK_PUBLIC_KEY in the environment.
  const paystackEnabled = useMemo(() => isPaystackConfigured(), []);
  const isOwnerMode = plan === 'owner';
  const isYearly = billing === 'yearly';

  const priceNaira = isYearly ? OWNER_PRICE_YEARLY_NAIRA : OWNER_PRICE_MONTHLY_NAIRA;

  const handleUpgrade = async () => {
    // No Paystack key configured => demo upgrade (unlock Owner Mode locally).
    if (!paystackEnabled) {
      try {
        await upgradeToOwner();
        toast.success('Welcome to Owner Mode');
        navigate('/');
      } catch (e) {
        toast.error(e.message || 'Could not upgrade.');
      }
      return;
    }

    if (!user?.email) {
      toast.error('Sign in to upgrade to Owner Mode.');
      return;
    }

    setPaying(true);
    try {
      await initializePayment({
        email: user.email,
        amount: priceNaira,
        // e.g. SS-YEARLY-1727101234567-AB12, so the plan is legible in Paystack.
        reference: makeReference(REFERENCE_PREFIX[billing]),
        onSuccess: async () => {
          setPaying(false);
          try {
            await upgradeToOwner();
            toast.success('Payment confirmed; welcome to Owner Mode');
            navigate('/');
          } catch (e) {
            toast.error(e.message || 'Payment received, but the upgrade could not be applied.');
          }
        },
        onCancel: () => {
          setPaying(false);
          toast('Payment cancelled. You can try again anytime.', { icon: '\u2139\uFE0F' });
        },
        onError: (error) => {
          setPaying(false);
          toast.error(error.message || 'Could not start payment.');
        },
      });
    } catch (e) {
      setPaying(false);
      toast.error(e.message || 'Could not start payment.');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Simple pricing for growing shops</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Start free at the counter. Upgrade when you want the full picture.
        </p>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex justify-center mb-10">
        <div
          role="radiogroup"
          aria-label="Billing cycle"
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!isYearly}
            onClick={() => setBilling('monthly')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              !isYearly ? 'bg-emerald-500 text-black' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isYearly}
            onClick={() => setBilling('yearly')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
              isYearly ? 'bg-emerald-500 text-black' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            Yearly
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                isYearly ? 'bg-black/10 text-black' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              Save {nairaWithCommas(OWNER_YEARLY_SAVINGS_NAIRA)}
            </span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Free */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-7">
          <h3 className="font-bold text-lg">Shop Mode</h3>
          <p className="text-3xl font-bold mt-2">
            &#8358;0<span className="text-sm font-normal text-zinc-500">/month</span>
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
            {nairaWithCommas(priceNaira)}
            <span className="text-sm font-normal text-zinc-500">
              {isYearly ? '/year' : '/month'}
            </span>
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1 h-4">
            {isYearly
              ? `Two months free, save ${nairaWithCommas(OWNER_YEARLY_SAVINGS_NAIRA)} a year`
              : `Or ${nairaWithCommas(OWNER_PRICE_YEARLY_NAIRA)}/year and save ${nairaWithCommas(OWNER_YEARLY_SAVINGS_NAIRA)}`}
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
            disabled={isOwnerMode || paying}
            className="w-full mt-8 px-4 py-3 rounded-2xl bg-emerald-500 text-black text-sm font-bold hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isOwnerMode ? (
              'You are on Owner Mode'
            ) : paying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Opening Paystack...
              </>
            ) : paystackEnabled ? (
              <>
                <CreditCard className="w-4 h-4" /> Pay {nairaWithCommas(priceNaira)}{' '}
                {isYearly ? 'yearly' : 'monthly'}
              </>
            ) : (
              'Upgrade to Owner Mode'
            )}
          </button>
          {!isOwnerMode && !storeIsDemo && (
            <p className="text-[11px] text-zinc-500 text-center mt-2">
              {paystackEnabled
                ? 'Secure checkout via Paystack.'
                : 'Demo billing (demo upgrade). Add VITE_PAYSTACK_PUBLIC_KEY for live payments.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
