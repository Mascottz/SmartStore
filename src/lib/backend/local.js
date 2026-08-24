// src/lib/backend/local.js
// LocalStorage-backed adapter. Used automatically when Supabase env vars
// are not configured, so the whole app works as an offline demo.
const DB_KEY = 'smartstore-db';
const SESSION_KEY = 'smartstore-session';

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const joinCode = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('local db parse failed', e);
  }
  return {
    users: [],
    stores: [],
    members: [],
    categories: [],
    products: [],
    sales: [],
    expenses: [],
    voidLogs: [],
  };
}

function save(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

const authListeners = new Set();
function emitAuth(user) {
  authListeners.forEach((cb) => cb(user));
}

function currentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { userId } = JSON.parse(raw);
    const db = load();
    const u = db.users.find((x) => x.id === userId);
    return u ? { id: u.id, email: u.email } : null;
  } catch {
    return null;
  }
}

export const localAdapter = {
  kind: 'local',

  auth: {
    async signUp({ email, password }) {
      const db = load();
      const normalized = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === normalized)) {
        throw new Error('That email already has an account. Try logging in instead.');
      }
      if ((password || '').length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      const user = { id: uid(), email: normalized, password };
      db.users.push(user);
      save(db);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
      const pub = { id: user.id, email: user.email };
      emitAuth(pub);
      return pub;
    },

    async signIn({ email, password }) {
      const db = load();
      const normalized = email.trim().toLowerCase();
      const user = db.users.find(
        (u) => u.email === normalized && u.password === password
      );
      if (!user) throw new Error('Email or password is not correct.');
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
      const pub = { id: user.id, email: user.email };
      emitAuth(pub);
      return pub;
    },

    async signOut() {
      localStorage.removeItem(SESSION_KEY);
      emitAuth(null);
    },

    async getUser() {
      return currentUser();
    },

    onChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
  },

  stores: {
    async getMyMembership(userId) {
      const db = load();
      const m = db.members.find((x) => x.userId === userId);
      if (!m) return null;
      const store = db.stores.find((s) => s.id === m.storeId);
      if (!store) return null;
      return { store, role: m.role };
    },

    async create(userId, email, { name, type, categories }) {
      const db = load();
      const store = {
        id: uid(),
        name,
        type,
        plan: 'free',
        isDemo: false,
        joinCode: joinCode(),
        onboarding: {
          completed: true,
          businessType: type,
          firstProductAdded: false,
          firstSaleCompleted: false,
        },
        createdAt: new Date().toISOString(),
      };
      db.stores.push(store);
      db.members.push({
        id: uid(),
        storeId: store.id,
        userId,
        email,
        role: 'owner',
        createdAt: new Date().toISOString(),
      });
      (categories || []).forEach((c) =>
        db.categories.push({ id: uid(), storeId: store.id, name: c })
      );
      save(db);
      return store;
    },

    async update(storeId, patch) {
      const db = load();
      const idx = db.stores.findIndex((s) => s.id === storeId);
      if (idx === -1) throw new Error('Store not found');
      const prev = db.stores[idx];
      db.stores[idx] = {
        ...prev,
        ...patch,
        onboarding: { ...prev.onboarding, ...(patch.onboarding || {}) },
      };
      save(db);
      return db.stores[idx];
    },

    async joinWithCode(userId, email, code) {
      const db = load();
      const store = db.stores.find(
        (s) => s.joinCode === code.trim().toUpperCase()
      );
      if (!store) throw new Error('No store found for that join code.');
      if (db.members.some((m) => m.userId === userId && m.storeId === store.id)) {
        return { store, role: db.members.find((m) => m.userId === userId).role };
      }
      db.members.push({
        id: uid(),
        storeId: store.id,
        userId,
        email,
        role: 'cashier',
        createdAt: new Date().toISOString(),
      });
      save(db);
      return { store, role: 'cashier' };
    },
  },

  categories: {
    async list(storeId) {
      return load()
        .categories.filter((c) => c.storeId === storeId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async add(storeId, name) {
      const db = load();
      const cat = { id: uid(), storeId, name };
      db.categories.push(cat);
      save(db);
      return cat;
    },
    async remove(id) {
      const db = load();
      db.categories = db.categories.filter((c) => c.id !== id);
      save(db);
    },
  },

  products: {
    async list(storeId) {
      return load()
        .products.filter((p) => p.storeId === storeId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async create(storeId, data) {
      const db = load();
      const product = {
        id: uid(),
        storeId,
        createdAt: new Date().toISOString(),
        ...data,
      };
      db.products.push(product);
      save(db);
      return product;
    },
    async update(id, patch) {
      const db = load();
      const idx = db.products.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('Product not found');
      db.products[idx] = { ...db.products[idx], ...patch };
      save(db);
      return db.products[idx];
    },
    async remove(id) {
      const db = load();
      db.products = db.products.filter((p) => p.id !== id);
      save(db);
    },
  },

  sales: {
    async list(storeId) {
      return load()
        .sales.filter((s) => s.storeId === storeId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    // Mirrors the transactional Firestore checkout: verify stock for every
    // line first, then decrement and write the sale atomically.
    async create(storeId, { items, paymentMethod, receiptNo, cashierEmail, trackStock }) {
      const db = load();
      if (trackStock) {
        for (const item of items) {
          const product = db.products.find((p) => p.id === item.productId);
          if (!product) throw new Error(`Product not found: ${item.name}`);
          if ((product.stock ?? 0) - item.qty < 0) {
            throw new Error(`Insufficient stock for ${item.name}`);
          }
        }
        for (const item of items) {
          const product = db.products.find((p) => p.id === item.productId);
          product.stock = (product.stock ?? 0) - item.qty;
        }
      }
      const sale = {
        id: uid(),
        storeId,
        receiptNo,
        paymentMethod,
        cashierEmail: cashierEmail || '',
        status: 'completed',
        items,
        total: items.reduce((sum, i) => sum + i.lineTotal, 0),
        createdAt: new Date().toISOString(),
      };
      db.sales.push(sale);
      save(db);
      return sale;
    },

    async void(saleId, reason, byEmail, trackStock) {
      const db = load();
      const sale = db.sales.find((s) => s.id === saleId);
      if (!sale) throw new Error('Sale not found');
      if (sale.status === 'voided') throw new Error('Sale already voided');
      sale.status = 'voided';
      if (trackStock) {
        for (const item of sale.items) {
          const product = db.products.find((p) => p.id === item.productId);
          if (product) product.stock = (product.stock ?? 0) + item.qty;
        }
      }
      db.voidLogs.push({
        id: uid(),
        storeId: sale.storeId,
        saleId: sale.id,
        receiptNo: sale.receiptNo,
        total: sale.total,
        reason: reason || 'No reason given',
        voidedBy: byEmail || '',
        createdAt: new Date().toISOString(),
      });
      save(db);
      return sale;
    },
  },

  expenses: {
    async list(storeId) {
      return load()
        .expenses.filter((e) => e.storeId === storeId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    async create(storeId, data) {
      const db = load();
      const expense = {
        id: uid(),
        storeId,
        createdAt: new Date().toISOString(),
        ...data,
      };
      db.expenses.push(expense);
      save(db);
      return expense;
    },
    async remove(id) {
      const db = load();
      db.expenses = db.expenses.filter((e) => e.id !== id);
      save(db);
    },
  },

  voidLogs: {
    async list(storeId) {
      return load()
        .voidLogs.filter((v) => v.storeId === storeId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
  },

  team: {
    async list(storeId) {
      return load()
        .members.filter((m) => m.storeId === storeId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },
    async updateRole(memberId, role) {
      const db = load();
      const m = db.members.find((x) => x.id === memberId);
      if (!m) throw new Error('Member not found');
      m.role = role;
      save(db);
      return m;
    },
    async remove(memberId) {
      const db = load();
      db.members = db.members.filter((m) => m.id !== memberId);
      save(db);
    },
  },
};
