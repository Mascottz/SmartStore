// src/mobile/OwnerMobileLayout.jsx
// The shell of the owner's monitoring app (/m): a phone-first app frame with
// a sticky header, a bottom tab bar on phones and a side rail on wider
// screens. It carries no POS register and no checkout — strictly monitoring.
import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Eye, LogOut, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/backend';
import { useAuth } from '../context/AuthContext';
import { useOwnerExperience } from '../context/OwnerExperienceContext';
import SplashScreen from '../components/SplashScreen';
import SmartAssistant from '../components/SmartAssistant';
import { MOBILE_TABS, MOBILE_MORE_ITEMS } from './navItems';
import logo from '/logo-smartstore.png';

export default function OwnerMobileLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { storeName, storeIsDemo, theme, toggleTheme } = useAuth();
  const { setMode } = useOwnerExperience();

  const isActive = (path) =>
    path === '/m'
      ? location.pathname === '/m'
      : location.pathname === path || location.pathname.startsWith(path + '/');

  const isMoreActive = !MOBILE_TABS.slice(0, 4).some((t) => isActive(t.path));

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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto w-full max-w-3xl lg:max-w-5xl flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-2xl bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden shrink-0">
            <img src={logo} alt="SmartStore NG" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate">{storeName || 'SmartStore NG'}</h1>
            <p className="text-[11px] flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <Eye className="w-3 h-3" aria-hidden="true" />
              Owner · Monitoring
              {storeIsDemo && <span className="text-amber-500">· Demo</span>}
            </p>
          </div>

          {/* Two-way mode switch */}
          <button
            onClick={switchToTransactional}
            title="Switch to Transactional mode (full app with POS)"
            aria-label="Switch to Transactional mode"
            className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 rotate-180" aria-hidden="true" />
            <span className="hidden sm:inline">Transactional</span>
          </button>

          <button
            onClick={toggleTheme}
            title="Toggle theme"
            aria-label="Toggle theme"
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex w-full">
        {/* Desktop side rail */}
        <nav
          aria-label="Monitoring navigation"
          className="hidden md:flex flex-col w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 gap-1"
        >
          {MOBILE_TABS.filter((t) => t.path !== '/m/more').map((item) => (
            <RailButton
              key={item.path}
              item={item}
              active={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}
          <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            More
          </p>
          {MOBILE_MORE_ITEMS.map((item) => (
            <RailButton
              key={item.path}
              item={item}
              active={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}
          <button
            onClick={handleSignOut}
            className="mt-auto w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-3xl lg:max-w-5xl px-4 md:px-8 pt-4 pb-28 md:pb-10">
            <Suspense fallback={<SplashScreen />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Bottom tab bar (phones) */}
      <nav
        aria-label="Monitoring navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-t border-zinc-200 dark:border-zinc-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.path === '/m/more' ? isMoreActive : isActive(tab.path);
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </nav>
      <SmartAssistant />
    </div>
  );
}

function RailButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-colors ${
        active
          ? 'bg-emerald-600 text-white'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
      <span className="truncate">{item.name}</span>
    </button>
  );
}
