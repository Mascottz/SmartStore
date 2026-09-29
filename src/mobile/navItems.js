// src/mobile/navItems.js
// Navigation model of the owner's monitoring app: the five phone tabs plus
// the deeper screens collected under "More". The desktop rail shows the More
// items directly, so wide screens never need the extra hop.
import {
  AlertTriangle,
  BarChart3,
  BookUser,
  Crown,
  DollarSign,
  Home,
  LayoutGrid,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

export const MOBILE_TABS = [
  { name: 'Home', icon: Home, path: '/m' },
  { name: 'Stock', icon: Package, path: '/m/inventory' },
  { name: 'Sales', icon: Receipt, path: '/m/sales' },
  { name: 'Credit', icon: BookUser, path: '/m/credit' },
  { name: 'More', icon: LayoutGrid, path: '/m/more' },
];

export const MOBILE_MORE_ITEMS = [
  { name: 'Reports', desc: 'Revenue, profit & top sellers', icon: BarChart3, path: '/m/reports' },
  { name: 'Expenses', desc: 'Money going out', icon: DollarSign, path: '/m/expenses' },
  { name: 'Expenses Report', desc: 'Category & monthly totals', icon: BarChart3, path: '/m/reports/expenses' },
  { name: 'Void Report', desc: 'The void audit trail', icon: AlertTriangle, path: '/m/reports/voids' },
  { name: 'Team', desc: 'Staff, roles & join code', icon: Users, path: '/m/team' },
  { name: 'User Approvals', desc: 'Access requests', icon: ShieldCheck, path: '/m/approvals' },
  { name: 'Owner Settings', desc: 'Store profile & categories', icon: Settings, path: '/m/owner-settings' },
  { name: 'Plan & Billing', desc: 'Owner Mode subscription', icon: Crown, path: '/m/pricing' },
];
