// src/components/Sidebar.jsx
import {
  Home,
  Package,
  ShoppingCart,
  BarChart3,
  Users,
  ShieldCheck,
  LogOut,
  Receipt,
  DollarSign,
  AlertTriangle,
  Settings,
  Moon,
  Sun,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, isDemoBackend } from '../lib/backend';
import { useAuth } from '../context/AuthContext';
import logo from '/logo-smartstore.png';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    role,
    storeName,
    plan,
    storeIsDemo,
    niche,
    theme,
    toggleTheme,
    upgradeToOwner,
  } = useAuth();

  const rank = { owner: 3, admin: 3, manager: 2, cashier: 1 };
  const userRank = rank[role] || 1;

  const isOwnerMode = plan === 'owner';
  const isOwner = role === 'owner';

  const menuItems = [
    { name: 'Dashboard', icon: Home, path: '/dashboard', minRole: 'manager' },
    {
      name: niche.itemNounPlural === 'Products' ? 'Inventory' : niche.itemNounPlural,
      icon: Package,
      path: '/inventory',
      minRole: 'manager',
    },
    { name: 'POS Register', icon: ShoppingCart, path: '/pos' },
    { name: 'Sales History', icon: Receipt, path: '/sales' },
    { name: 'Reports', icon: BarChart3, path: '/reports', minRole: 'manager' },
    {
      name: 'Void Report',
      icon: AlertTriangle,
      path: '/reports/voids',
      minRole: 'manager',
    },
    { name: 'Expenses', icon: DollarSign, path: '/expenses', minRole: 'manager' },
    {
      name: 'Expenses Report',
      icon: BarChart3,
      path: '/reports/expenses',
      minRole: 'manager',
    },
    { name: 'Team', icon: Users, path: '/team', minRole: 'admin' },
    {
      name: 'User Approvals',
      icon: ShieldCheck,
      path: '/admin/approvals',
      ownerOnly: true,
    },
  ];

  const handleSignOut = async () => {
    await api.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="w-full md:w-72 bg-white dark:bg-zinc-900 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col md:min-h-screen">
      {/* Header */}
      <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden">
            <img
              src={logo}
              alt="SmartStore NG"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
              {storeName || 'SmartStore NG'}
            </h1>
            <p className="text-[11px] text-emerald-500 dark:text-emerald-400">
              {storeIsDemo
                ? 'Demo Store · Owner Mode'
                : isOwnerMode
                ? `${niche.label} · Owner Mode`
                : `${niche.label} · Shop Mode`}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
        {isDemoBackend && (
          <p className="mt-3 text-[10px] px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Local demo mode, add Supabase keys to go live
          </p>
        )}
      </div>

      {/* Menu */}
      <div className="flex-1 p-4">
        {menuItems
          .filter((item) => {
            if (item.ownerOnly && !isOwner) return false;
            if (!item.minRole) return true;
            return userRank >= (rank[item.minRole] || 1);
          })
          .map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname === item.path ||
                  location.pathname.startsWith(item.path + '/');

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl mb-1 transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </button>
            );
          })}

        {isOwner && (
          <button
            onClick={() => navigate('/owner-settings')}
            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl mt-2 transition-all ${
              location.pathname.startsWith('/owner-settings')
                ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Owner Settings</span>
          </button>
        )}
      </div>

      {/* Upgrade CTA */}
      {!isOwnerMode && !storeIsDemo && (
        <div className="px-4 pb-3">
          <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-3">
            <p className="text-xs text-zinc-700 dark:text-zinc-300 mb-2">
              Unlock Owner Mode to see your shop from anywhere and get full
              reports.
            </p>
            <button
              className="w-full px-3 py-2 rounded-full bg-emerald-500 text-black text-xs font-semibold hover:bg-emerald-400"
              onClick={upgradeToOwner}
            >
              Upgrade to Owner Mode
            </button>
          </div>
        </div>
      )}

      {/* Sign out */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-5 py-3.5 text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-2xl"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
