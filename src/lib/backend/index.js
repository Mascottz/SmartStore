// src/lib/backend/index.js
// Picks the active backend adapter and layers a tiny pub/sub on top so
// pages refetch after any mutation (replacement for Firestore onSnapshot).
import { localAdapter } from './local';
import { supabaseAdapter, isSupabaseConfigured } from './supabase';

export const DEMO_SANDBOX_KEY = 'smartstore-demo-sandbox';

export function isDemoSandbox() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    return window.sessionStorage.getItem(DEMO_SANDBOX_KEY) === 'true';
  } catch {
    return false;
  }
}

export function enterDemoSandbox() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(DEMO_SANDBOX_KEY, 'true');
    }
  } catch {}
}

export function exitDemoSandbox() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(DEMO_SANDBOX_KEY);
    }
  } catch {}
}

export function bootDemoSandbox(destination = '/dashboard') {
  enterDemoSandbox();
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = destination;
  }
}

export function leaveDemoSandbox(destination = '/login') {
  exitDemoSandbox();
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = destination;
  }
}

export const backend =
  isSupabaseConfigured && !isDemoSandbox() ? supabaseAdapter : localAdapter;
export const isDemoBackend = !isSupabaseConfigured;

// ---- change events -------------------------------------------------------
const listeners = new Set();

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifyChange(topic = '*') {
  listeners.forEach((cb) => cb(topic));
}

// Wrap all mutating namespaces so every successful write fires an event.
// `extraTopics` is for writes that also change other collections (a credit
// repayment moves the sale's amountPaid, for example).
function withNotify(ns, topic, mutatingKeys, extraTopics = []) {
  const wrapped = {};
  for (const key of Object.keys(ns)) {
    if (mutatingKeys.includes(key)) {
      wrapped[key] = async (...args) => {
        const result = await ns[key](...args);
        notifyChange(topic);
        extraTopics.forEach((t) => notifyChange(t));
        return result;
      };
    } else {
      wrapped[key] = ns[key].bind(ns);
    }
  }
  return wrapped;
}

export const api = {
  kind: backend.kind,
  auth: backend.auth,
  stores: withNotify(backend.stores, 'stores', ['create', 'update', 'joinWithCode']),
  categories: withNotify(backend.categories, 'categories', ['add', 'remove']),
  // Pharmacy products are created with (and removed with) their batches, so
  // product writes also refresh batch listeners.
  products: withNotify(backend.products, 'products', ['create', 'update', 'remove'], ['batches']),
  // Batch writes move the product rollup (stock + earliest expiry), so they
  // refresh product listeners too.
  batches: withNotify(backend.batches, 'batches', ['add', 'update', 'remove'], ['products']),
  sales: withNotify(backend.sales, 'sales', ['create', 'void'], ['products', 'batches']),
  // Repayments also change the sale's amountPaid, so notify both topics.
  creditPayments: withNotify(backend.creditPayments, 'creditPayments', ['add', 'remove'], ['sales']),
  expenses: withNotify(backend.expenses, 'expenses', ['create', 'remove']),
  voidLogs: backend.voidLogs,
  team: withNotify(backend.team, 'team', [
    'updateRole',
    'updateApproval',
    'remove',
  ]),
  admin: withNotify(backend.admin, 'admin', [
    'updateApproval',
    'deleteUser',
    'deleteStore',
    'upgradeStoreToOwner',
  ]),
};
