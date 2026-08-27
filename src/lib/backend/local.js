// src/lib/backend/local.js
// LocalStorage-backed adapter. Used automatically when Supabase env vars
// are not configured, so the whole app works as an offline demo.
import { sanitize, clamp } from '../validate';
import { isSuperAdminEmail } from '../superAdmin';

const DB_KEY = 'smartstore-db';
const SESSION_KEY = 'smartstore-session';

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const approvalStatus = (member) => member?.approvalStatus || 'approved';

// Use crypto.randomUUID when available, fall back to a timestamp+random combo.
const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};

const joinCode = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

// ---- Rate limiting for auth -----------------------------------------------
const AUTH_ATTEMPTS_KEY = 'smartstore-auth-attempts';
const MAX_AUTH_ATTEMPTS = 10;
const AUTH_LOCKOUT_MS = 60_000; // 1 minute

function checkRateLimit() {
  try {
    const raw = localStorage.getItem(AUTH_ATTEMPTS_KEY);
    const record = raw ? JSON.parse(raw) : { count: 0, firstAt: 0 };
    const now = Date.now();

    // Reset window if enough time has passed
    if (now - record.firstAt > AUTH_LOCKOUT_MS) {
      localStorage.setItem(
        AUTH_ATTEMPTS_KEY,
        JSON.stringify({ count: 1, firstAt: now })
      );
      return;
    }

    if (record.count >= MAX_AUTH_ATTEMPTS) {
      const waitSec = Math.ceil(
        (AUTH_LOCKOUT_MS - (now - record.firstAt)) / 1000
      );
      throw new Error(
        `Too many attempts. Please wait ${waitSec} seconds.`
      );
    }

    record.count += 1;
    localStorage.setItem(AUTH_ATTEMPTS_KEY, JSON.stringify(record));
  } catch (e) {
    if (e.message.startsWith('Too many')) throw e;
    // If localStorage fails, don't block auth
  }
}

function resetRateLimit() {
  try {
    localStorage.removeItem(AUTH_ATTEMPTS_KEY);
  } catch {
    // ignore
  }
}

// ---- DB helpers -----------------------------------------------------------
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
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    // Handle quota exceeded
    if (e.name === 'QuotaExceededError') {
      throw new Error(
        'Storage is full. Try clearing some old data or use a Supabase backend.'
      );
    }
    throw e;
  }
}

const authListeners = new Set();
function emitAuth(user) {
  authListeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error('auth listener error', e);
    }
  });
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

// ---- Adapter --------------------------------------------------------------
export const localAdapter = {
  kind: 'local',

  auth: {
    async signUp({ email, password }) {
      checkRateLimit();

      const normalized = sanitize(email).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new Error('Please enter a valid email address.');
      }
      if ((password || '').length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      if (password.length > 128) {
        throw new Error('Password is too long (max 128 characters).');
      }

      const db = load();
      if (db.users.some((u) => u.email === normalized)) {
        throw new Error('That email already has an account. Try logging in instead.');
      }

      const user = {
        id: uid(),
        email: normalized,
        password,
        // The designated administrator never waits in the local approval queue.
        approvalStatus:
          isSuperAdminEmail(normalized) || normalized === 'demo@smartstoreng.com'
            ? 'approved'
            : 'pending',
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      save(db);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
      resetRateLimit();
      const pub = { id: user.id, email: user.email };
      emitAuth(pub);
      return pub;
    },

    async signIn({ email, password }) {
      checkRateLimit();

      const normalized = sanitize(email).toLowerCase();
      if (!normalized || !password) {
        throw new Error('Email and password are required.');
      }

      const db = load();
      const user = db.users.find(
        (u) => u.email === normalized && u.password === password
      );
      if (!user) throw new Error('Email or password is not correct.');

      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
      resetRateLimit();
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
      return { store, role: m.role, approvalStatus: approvalStatus(m) };
    },

    async create(userId, email, { name, type, categories }) {
      const cleanName = clamp(sanitize(name), 100);
      if (!cleanName) throw new Error('Store name is required.');
      if (cleanName.length < 2) throw new Error('Store name must be at least 2 characters.');

      const db = load();
      const store = {
        id: uid(),
        name: cleanName,
        type: sanitize(type) || 'other',
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
        email: sanitize(email),
        role: 'owner',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString(),
      });
      (categories || []).forEach((c) => {
        const catName = clamp(sanitize(c), 100);
        if (catName) {
          db.categories.push({ id: uid(), storeId: store.id, name: catName });
        }
      });
      save(db);
      return store;
    },

    async update(storeId, patch) {
      const db = load();
      const idx = db.stores.findIndex((s) => s.id === storeId);
      if (idx === -1) throw new Error('Store not found');

      // Sanitize string fields in the patch
      const clean = { ...patch };
      if (clean.name !== undefined) clean.name = clamp(sanitize(clean.name), 100);
      if (clean.type !== undefined) clean.type = sanitize(clean.type);

      const prev = db.stores[idx];
      db.stores[idx] = {
        ...prev,
        ...clean,
        onboarding: { ...prev.onboarding, ...(clean.onboarding || {}) },
      };
      save(db);
      return db.stores[idx];
    },

    async joinWithCode(userId, email, code) {
      const cleanCode = sanitize(code).toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
        throw new Error('Invalid join code format.');
      }

      const db = load();
      const store = db.stores.find((s) => s.joinCode === cleanCode);
      if (!store) throw new Error('No store found for that join code.');

      // One membership per account, mirroring the SQL schema's
      // unique (user_id). An approved member is immovable: re-entering any
      // code is a no-op that reports their real status. A pending or
      // rejected request, however, follows the code that was typed last —
      // otherwise a mistyped code would strand the request in a store whose
      // owner never sees it (and whose approvals page stays empty).
      const existing = db.members.find((m) => m.userId === userId);
      if (existing) {
        if (approvalStatus(existing) === 'approved') {
          return {
            store,
            role: existing.role,
            approvalStatus: approvalStatus(existing),
          };
        }
        existing.storeId = store.id;
        existing.email = sanitize(email);
        existing.role = 'cashier';
        existing.approvalStatus = isSuperAdminEmail(email) ? 'approved' : 'pending';
        existing.createdAt = new Date().toISOString();
        save(db);
        return { store, role: 'cashier', approvalStatus: approvalStatus(existing) };
      }

      const memberApprovalStatus = isSuperAdminEmail(email) ? 'approved' : 'pending';
      db.members.push({
        id: uid(),
        storeId: store.id,
        userId,
        email: sanitize(email),
        role: 'cashier',
        approvalStatus: memberApprovalStatus,
        createdAt: new Date().toISOString(),
      });
      save(db);
      return { store, role: 'cashier', approvalStatus: memberApprovalStatus };
    },
  },

  categories: {
    async list(storeId) {
      return load()
        .categories.filter((c) => c.storeId === storeId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async add(storeId, name) {
      const cleanName = clamp(sanitize(name), 100);
      if (!cleanName) throw new Error('Category name is required.');

      const db = load();
      if (
        db.categories.some(
          (c) => c.storeId === storeId && c.name.toLowerCase() === cleanName.toLowerCase()
        )
      ) {
        throw new Error('That category already exists.');
      }
      const cat = { id: uid(), storeId, name: cleanName };
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
      const cleanName = clamp(sanitize(data.name), 200);
      if (!cleanName) throw new Error('Product name is required.');

      const db = load();
      const product = {
        id: uid(),
        storeId,
        name: cleanName,
        sku: clamp(sanitize(data.sku || ''), 50),
        category: clamp(sanitize(data.category || 'General'), 100),
        costPrice: Math.max(0, Number(data.costPrice) || 0),
        salePrice: Math.max(0, Number(data.salePrice) || 0),
        stock: Math.max(0, Math.floor(Number(data.stock) || 0)),
        expiryDate: data.expiryDate || null,
        createdAt: new Date().toISOString(),
      };
      db.products.push(product);
      save(db);
      return product;
    },
    async update(id, patch) {
      const db = load();
      const idx = db.products.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('Product not found');

      const clean = { ...patch };
      if (clean.name !== undefined) clean.name = clamp(sanitize(clean.name), 200);
      if (clean.sku !== undefined) clean.sku = clamp(sanitize(clean.sku), 50);
      if (clean.category !== undefined) clean.category = clamp(sanitize(clean.category), 100);
      if (clean.costPrice !== undefined) clean.costPrice = Math.max(0, Number(clean.costPrice) || 0);
      if (clean.salePrice !== undefined) clean.salePrice = Math.max(0, Number(clean.salePrice) || 0);
      if (clean.stock !== undefined) clean.stock = Math.max(0, Math.floor(Number(clean.stock) || 0));

      db.products[idx] = { ...db.products[idx], ...clean };
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

    async create(storeId, { items, paymentMethod, receiptNo, cashierEmail, trackStock }) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Cart is empty.');
      }
      if (items.length > 200) {
        throw new Error('Too many items in a single sale.');
      }

      const db = load();

      // Validate every line item
      for (const item of items) {
        if (!item.productId || !item.name || item.qty < 1) {
          throw new Error('Invalid item in cart.');
        }
      }

      if (trackStock) {
        // First pass: verify all stock is sufficient
        for (const item of items) {
          const product = db.products.find((p) => p.id === item.productId);
          if (!product) throw new Error(`Product not found: ${item.name}`);
          if ((product.stock ?? 0) - item.qty < 0) {
            throw new Error(`Insufficient stock for ${item.name}`);
          }
        }
        // Second pass: decrement
        for (const item of items) {
          const product = db.products.find((p) => p.id === item.productId);
          product.stock = (product.stock ?? 0) - item.qty;
        }
      }

      const allowedMethods = ['Cash', 'Transfer', 'POS/Card'];
      const method = allowedMethods.includes(paymentMethod)
        ? paymentMethod
        : 'Cash';

      const sale = {
        id: uid(),
        storeId,
        receiptNo: clamp(sanitize(receiptNo), 30),
        paymentMethod: method,
        cashierEmail: clamp(sanitize(cashierEmail || ''), 200),
        status: 'completed',
        items: items.map((i) => ({
          productId: i.productId,
          name: clamp(sanitize(i.name), 200),
          qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
          price: Math.max(0, Number(i.price) || 0),
          lineTotal: Math.max(0, Number(i.lineTotal) || 0),
        })),
        total: items.reduce((sum, i) => sum + (Number(i.lineTotal) || 0), 0),
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
        reason: clamp(sanitize(reason || 'No reason given'), 500),
        voidedBy: clamp(sanitize(byEmail || ''), 200),
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
      const cleanTitle = clamp(sanitize(data.title), 200);
      if (!cleanTitle) throw new Error('Expense title is required.');
      const amount = Number(data.amount);
      if (!amount || amount <= 0 || amount > 999_999_999) {
        throw new Error('Enter a valid expense amount.');
      }

      const db = load();
      const expense = {
        id: uid(),
        storeId,
        title: cleanTitle,
        amount,
        category: clamp(sanitize(data.category || 'Other'), 100),
        note: clamp(sanitize(data.note || ''), 500),
        date: data.date || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
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
        .map((m) => ({ ...m, approvalStatus: approvalStatus(m) }))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },
    async updateRole(memberId, role) {
      const allowed = ['cashier', 'manager', 'admin'];
      if (!allowed.includes(role)) throw new Error('Invalid role.');

      const db = load();
      const m = db.members.find((x) => x.id === memberId);
      if (!m) throw new Error('Member not found');
      if (m.role === 'owner') throw new Error('Cannot change the owner role.');
      m.role = role;
      save(db);
      return m;
    },
    async updateApproval(memberId, status) {
      if (!APPROVAL_STATUSES.includes(status)) {
        throw new Error('Invalid approval status.');
      }
      const db = load();
      const m = db.members.find((x) => x.id === memberId);
      if (!m) throw new Error('Member not found');
      if (m.role === 'owner') throw new Error('The store owner is always approved.');
      m.approvalStatus = status;
      save(db);
      return { ...m, approvalStatus: status };
    },
    async remove(memberId) {
      const db = load();
      const m = db.members.find((x) => x.id === memberId);
      if (!m) throw new Error('Member not found');
      if (m.role === 'owner') throw new Error('Cannot remove the store owner.');
      db.members = db.members.filter((x) => x.id !== memberId);
      save(db);
    },
  },

  // System-wide functions used by the hidden Super Admin console. The local
  // adapter intentionally contains no passwords in any returned record.
  admin: {
    async getDashboard() {
      const db = load();
      const stores = db.stores.map((store) => {
        const members = db.members.filter((m) => m.storeId === store.id);
        return {
          ...store,
          memberCount: members.length,
          pendingCount: members.filter((m) => approvalStatus(m) === 'pending').length,
        };
      });
      const users = db.users.map((user) => {
        const member = db.members.find((m) => m.userId === user.id);
        const store = member && db.stores.find((s) => s.id === member.storeId);
        return {
          id: user.id,
          userId: user.id,
          membershipId: member?.id || null,
          email: user.email,
          role: member?.role || null,
          approvalStatus: member
            ? approvalStatus(member)
            : user.approvalStatus || 'unassigned',
          storeId: store?.id || null,
          storeName: store?.name || '',
          createdAt: user.createdAt || member?.createdAt || null,
          joinedAt: member?.createdAt || null,
        };
      });
      const statuses = users.map((u) => u.approvalStatus);
      const sales = db.sales.filter((sale) => sale.status === 'completed');
      const products = db.products;
      const expenses = db.expenses;
      return {
        stats: {
          totalUsers: users.length,
          totalStores: stores.length,
          totalMembers: db.members.length,
          pendingUsers: statuses.filter((s) => s === 'pending').length,
          approvedUsers: statuses.filter((s) => s === 'approved').length,
          rejectedUsers: statuses.filter((s) => s === 'rejected').length,
          revenue: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
          profit: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0) - expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
        },
        users,
        stores,
        sales,
        products,
        expenses,
      };
    },
    async listUsers() {
      const dashboard = await this.getDashboard();
      return dashboard.users;
    },
    async listAllUsers() {
      return this.listUsers();
    },
    async listPendingUsers() {
      return (await this.listUsers()).filter((user) => user.approvalStatus === 'pending');
    },
    async listStores() {
      const dashboard = await this.getDashboard();
      return dashboard.stores;
    },
    async updateApproval(memberId, status) {
      return localAdapter.team.updateApproval(memberId, status);
    },
    async approveUser(memberId) {
      return this.updateApproval(memberId, 'approved');
    },
    async rejectUser(memberId) {
      return this.updateApproval(memberId, 'rejected');
    },
    async deleteUser(userId) {
      const db = load();
      const memberIds = db.members.filter((member) => member.userId === userId).map((member) => member.id);
      db.members = db.members.filter((member) => member.userId !== userId);
      db.users = db.users.filter((user) => user.id !== userId);
      save(db);
      return { userId, memberIds };
    },
    async deleteStore(storeId) {
      const db = load();
      db.stores = db.stores.filter((store) => store.id !== storeId);
      db.members = db.members.filter((member) => member.storeId !== storeId);
      db.categories = db.categories.filter((item) => item.storeId !== storeId);
      db.products = db.products.filter((item) => item.storeId !== storeId);
      db.sales = db.sales.filter((item) => item.storeId !== storeId);
      db.expenses = db.expenses.filter((item) => item.storeId !== storeId);
      db.voidLogs = db.voidLogs.filter((item) => item.storeId !== storeId);
      save(db);
      return storeId;
    },
    async upgradeStoreToOwner(storeId) {
      const db = load();
      const store = db.stores.find((s) => s.id === storeId);
      if (!store) throw new Error('Store not found');
      store.plan = 'owner';
      save(db);
      return storeId;
    },
  },
};
