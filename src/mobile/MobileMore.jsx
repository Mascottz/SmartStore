// src/mobile/MobileMore.jsx
// The More tab of the monitoring app: the two-way mode switch (with an
// explanation of how the device default works), every deeper monitoring
// screen as a tile, and sign out.
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut, MonitorSmartphone, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/backend';
import { useOwnerExperience } from '../context/OwnerExperienceContext';
import { MOBILE_MORE_ITEMS } from './navItems';

export default function MobileMore() {
  const navigate = useNavigate();
  const { setMode, deviceDefault } = useOwnerExperience();

  const switchToTransactional = () => {
    setMode('transactional');
    toast.success('Transactional mode — full app with POS register');
    navigate('/dashboard', { replace: true });
  };

  const handleSignOut = async () => {
    await api.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">More</h1>

      {/* Two-way mode card */}
      <section
        aria-label="Owner app modes"
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <MonitorSmartphone className="w-5 h-5 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Owner app modes</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Your Owner Mode plan includes two ways to open SmartStore.{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Monitoring
              </span>{' '}
              is this app: the shop on your phone, no selling.{' '}
              <span className="font-semibold">Transactional</span> is the full app with the POS
              register.
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 flex items-center gap-1">
              <Eye className="w-3 h-3 shrink-0" aria-hidden="true" />
              By default your {deviceDefault === 'monitoring' ? 'phone' : 'computer'} opens{' '}
              {deviceDefault}; switching is remembered on this device.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div
            aria-current="true"
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-emerald-500 text-black text-xs font-bold"
          >
            <Eye className="w-4 h-4" aria-hidden="true" /> Monitoring
          </div>
          <button
            onClick={switchToTransactional}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:border-emerald-500"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" /> Transactional
          </button>
        </div>
      </section>

      {/* Tiles */}
      <section aria-label="More screens" className="grid grid-cols-2 gap-2.5">
        {MOBILE_MORE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="text-left bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 active:scale-[0.98] transition-transform"
            >
              <Icon className="w-5 h-5 text-emerald-500" aria-hidden="true" />
              <p className="text-sm font-semibold mt-2.5">{item.name}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{item.desc}</p>
            </button>
          );
        })}
      </section>

      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-red-300 dark:border-red-900 text-red-500 text-sm font-semibold hover:bg-red-500/10"
      >
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
    </div>
  );
}
