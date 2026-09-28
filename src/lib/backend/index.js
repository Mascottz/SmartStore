// src/lib/backend/index.js
// Picks the active backend adapter and layers a tiny pub/sub on top so
// pages refetch after any mutation (replacement for Firestore onSnapshot).
import { localAdapter } from './local';
import { supabaseAdapter, isSupabaseConfigured } from './supabase';

export const backend = isSupabaseConfigured ? supabaseAdapter : localAdapter;
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
  products: withNotify(backend.products, 'products', ['create', 'update', 'remove']),
  sales: withNotify(backend.sales, 'sales', ['create', 'void']),
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
