// src/pages/Demo.jsx
// Public quick-demo page. One click seeds (or reuses) the demo store and drops
// the visitor straight into a fully populated dashboard, so they can try
// SmartStore without creating an account. On deployments configured with a
// real backend (Supabase), the demo runs in a browser-only sandbox so the
// demo account never hits Supabase Auth.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookUser,
  Loader2,
  Package,
  Pill,
  PlayCircle,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { loginOrCreateDemo, loginOrCreatePharmacyDemo } from '../lib/demo';
import { bootDemoSandbox, isDemoBackend } from '../lib/backend';
import { useAuth } from '../context/AuthContext';
import logo from '/logo-smartstore.png';

const HIGHLIGHTS = [
  ['Ring up a sale', 'A stocked register with real Nigerian products, ready to sell.', ShoppingCart],
  ['See the reports', 'Sales, profit and expense dashboards already filled with history.', BarChart3],
  ['Work the Credit Book', 'Customers who owe balances, with repayments recorded against them.', BookUser],
  ['Manage inventory', 'Products, categories and stock levels you can edit on the spot.', Package],
];

export default function Demo() {
  const navigate = useNavigate();
  const { refreshMembership } = useAuth();
  const [loading, setLoading] = useState(null); // null | 'supermarket' | 'pharmacy'

  const enterDemo = async (kind = 'supermarket') => {
    setLoading(kind);
    const seed =
      kind === 'pharmacy' ? loginOrCreatePharmacyDemo : loginOrCreateDemo;
    try {
      if (isDemoBackend) {
        await seed();
        await refreshMembership();
        toast.success(
          kind === 'pharmacy' ? 'Welcome to the pharmacy demo' : 'Welcome to the demo store'
        );
        navigate('/dashboard', { replace: true });
      } else {
        await seed({ localOnly: true });
        toast.success(
          kind === 'pharmacy' ? 'Welcome to the pharmacy demo' : 'Welcome to the demo store'
        );
        bootDemoSandbox('/dashboard');
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not start the demo. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <nav className="border-b border-zinc-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="SmartStore NG home">
            <img src={logo} alt="SmartStore NG" className="h-9 w-9 rounded-xl object-contain" />
            <span className="text-lg font-bold tracking-tight text-zinc-900">
              SmartStore <span className="text-emerald-600">NG</span>
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 transition-colors hover:text-emerald-600"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to home
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-5 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            No sign up needed
          </p>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl">
            Try the full app with a <span className="text-emerald-600">demo store.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-zinc-600">
            We have set up Demo Supermart with products, past sales, expenses and a live Credit
            Book — or Healthway Pharmacy, stocked batch-by-batch with expiry tracking and
            prescription checks. Jump in and explore every feature in seconds.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => enterDemo('supermarket')}
              disabled={Boolean(loading)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 py-3.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-60 sm:w-auto"
            >
              {loading === 'supermarket' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Setting up your demo...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" aria-hidden="true" /> Enter the demo store
                </>
              )}
            </button>
            <button
              onClick={() => enterDemo('pharmacy')}
              disabled={Boolean(loading)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-600/40 bg-emerald-50 px-7 py-3.5 font-semibold text-emerald-800 transition-colors hover:border-emerald-500 hover:bg-emerald-100 disabled:opacity-60 sm:w-auto"
            >
              {loading === 'pharmacy' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Setting up the pharmacy...
                </>
              ) : (
                <>
                  <Pill className="h-4 w-4" aria-hidden="true" /> Try the Pharmacy Mode demo
                </>
              )}
            </button>
            <button
              onClick={() => navigate('/login')}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-7 py-3.5 font-semibold text-zinc-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 sm:w-auto"
            >
              Create my own store <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 text-sm text-zinc-500">
            <Receipt className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Nothing you do in the demo affects a real business.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {HIGHLIGHTS.map(([title, text, Icon]) => (
            <div
              key={title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-emerald-300 hover:shadow-[0_12px_32px_-16px_rgba(5,150,105,0.25)]"
            >
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="font-semibold text-zinc-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-zinc-500 sm:flex-row lg:px-8">
          <span>
            Powered by{' '}
            <span className="font-semibold text-zinc-700">MASTECH INNOVATIONS</span>
          </span>
          <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="mailto:info@mastechinnovations.com.ng" className="hover:text-emerald-600">
              info@mastechinnovations.com.ng
            </a>
            <a href="tel:+2349138825300" className="hover:text-emerald-600">
              +234 913 882 5300
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
