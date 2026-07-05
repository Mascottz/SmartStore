// src/pages/Pricing.jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Pricing() {
  const { plan, storeId } = useAuth();
  const [loading, setLoading] = useState(false);

  // In Vercel, set VITE_API_BASE_URL to your Render URL for production
  const API_BASE =
    import.meta.env.VITE_API_BASE_URL || 'https://smartstore-bill.onrender.com';

  const handleUpgrade = async () => {
    if (!storeId) {
      alert('Store not ready yet. Please reopen the app and try again.');
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/api/owner-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });

      if (!res.ok) {
        throw new Error('Could not start checkout. Please try again.');
      }

      const data = await res.json();

      if (!data.checkoutUrl) {
        throw new Error('No checkout URL returned from server.');
      }

      // Redirect to Monnify checkout
      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-zinc-950 min-h-screen text-white">
      <h1 className="text-4xl font-bold mb-2">Pricing</h1>
      <p className="text-zinc-400 mb-8">
        Run your shop for free. Upgrade when you’re ready to be the boss.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Shop Mode */}
        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <h2 className="text-2xl font-semibold mb-1">Shop Mode</h2>
          <p className="text-emerald-400 font-semibold mb-2">Free forever</p>
          <p className="text-zinc-400 mb-4">
            Everything you need to record sales and stock without any monthly fees.
          </p>
          <ul className="text-sm text-zinc-300 space-y-1 mb-4">
            <li>• POS register for everyday sales</li>
            <li>• Basic inventory tracking</li>
            <li>• Daily sales summary on device</li>
          </ul>
          <p className="text-xs text-zinc-500">
            Perfect for small shops getting started with SmartStore.
          </p>
        </div>

        {/* Owner Mode */}
        <div className="bg-emerald-500/10 rounded-3xl p-6 border border-emerald-500/60">
          <h2 className="text-2xl font-semibold mb-1">Owner Mode</h2>
          <p className="text-emerald-400 font-semibold mb-2">
            ₦10,000/month per store
          </p>
          <p className="text-zinc-300 mb-4">
            See your shop from anywhere, protect your stock, and track real profit.
          </p>
          <ul className="text-sm text-zinc-200 space-y-1 mb-4">
            <li>• Live owner dashboard (web & mobile)</li>
            <li>• Automatic cloud backup</li>
            <li>• Profit, expense, and staff performance reports</li>
            <li>• Team roles, void & discount history</li>
            <li>• Low‑stock alerts</li>
          </ul>
          <button
            className="w-full px-4 py-2 rounded-full bg-emerald-500 text-black font-medium hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-400"
            onClick={handleUpgrade}
            disabled={plan === 'owner' || loading}
          >
            {plan === 'owner'
              ? 'You’re on Owner Mode'
              : loading
              ? 'Starting checkout…'
              : 'Upgrade to Owner Mode'}
          </button>
          <p className="text-xs text-zinc-500 mt-3">
            Cancel anytime. Your shop will continue on free Shop Mode.
          </p>
        </div>
      </div>
    </div>
  );
}