// src/components/Sidebar.jsx
import {
  Home,
  Package,
  ShoppingCart,
  BarChart3,
  Users,
  LogOut,
  Receipt,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import logo from '/logo-smartstore.png';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, storeName, plan, storeIsDemo, upgradeToOwner } = useAuth();

  const rank = { owner: 3, admin: 3, manager: 2, cashier: 1 };
  const userRank = rank[role] || 1;

  const isOwnerMode = plan === 'owner';
  const menuItems = [
  {
    name: 'Dashboard',
    icon: Home,
    path: '/',
    minRole: 'manager',   
  },

    // Manager+ only
    {
      name: 'Inventory',
      icon: Package,
      path: '/inventory',
      minRole: 'manager',
    },

    { name: 'POS Register', icon: ShoppingCart, path: '/pos' },
    { name: 'Sales History', icon: Receipt, path: '/sales' },

    {
      name: 'Reports',
      icon: BarChart3,
      path: '/reports',
      minRole: 'manager',
    },
    {
      name: 'Void Report',
      icon: AlertTriangle,
      path: '/reports/voids',
      minRole: 'manager',
    },
    {
      name: 'Expenses',
      icon: DollarSign,
      path: '/expenses',
      minRole: 'manager',
    },
    {
      name: 'Expenses Report',
      icon: BarChart3,
      path: '/reports/expenses',
      minRole: 'manager',
    },
    { name: 'Team', icon: Users, path: '/team', minRole: 'admin' },
  ];

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Header: logo + store + plan */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center overflow-hidden">
            <img
              src={logo}
              alt="SmartStore NG"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">
              {storeName || 'SmartStore NG'}
            </h1>
            <p className="text-[11px] text-emerald-400">
              {storeIsDemo
                ? 'Demo Store · Owner Mode'
                : isOwnerMode
                ? 'Owner Mode · ₦10,000/mo'
                : 'Shop Mode · Free'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        {menuItems
          .filter((item) => {
            if (!item.minRole) return true;
            const requiredRank = rank[item.minRole] || 1;
            return userRank >= requiredRank;
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
                className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl mb-1 transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </button>
            );
          })}
      </div>

      {/* Upgrade CTA only if on free plan AND not demo */}
      {!isOwnerMode && !storeIsDemo && (
        <div className="px-4 pb-3">
          <div className="bg-zinc-800 rounded-2xl p-3">
            <p className="text-xs text-zinc-300 mb-2">
              Unlock Owner Mode to see your shop from anywhere and get full reports.
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

      <div className="p-4 border-t border-zinc-800">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-5 py-4 text-red-400 hover:bg-zinc-800 rounded-2xl"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}