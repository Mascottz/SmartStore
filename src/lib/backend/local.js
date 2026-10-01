// src/lib/backend/local.js
// LocalStorage-backed adapter. Used automatically when Supabase env vars
// are not configured, so the whole app works as an offline demo.
import { sanitize, clamp } from '../validate';
import { isSuperAdminEmail } from '../superAdmin';
import { checkTeamChange } from '../teamLimits';
import { allocateFefo } from '../pharmacy';

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
    batches: [],
    sales: [],
    expenses: [],
    creditPayments: [],
    voidLogs: [],
    suppliers: [],
    purchases: [],
    prescriptions: [],
    prescriptionItems: [],
    dispensings: [],
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

// ---- Pharmacy batch helpers ------------------------------------------------
// Local mirror of the product_batches_sync_stock trigger in
// 010_pharmacy_mode.sql: after any batch change, the product's stock is the
// sum of its active batches and its expiry mirrors the earliest active
// batch expiry, so every part of the app that reads products.stock /
// products.expiry_date keeps working with batch-tracked medicines.
function syncProductStock(db, productId) {
  const product = db.products.find((p) => p.id === productId);
  if (!product) return;
  const active = (db.batches || []).filter(
    (b) => b.productId === productId && (b.status || 'active') === 'active'
  );
  product.stock = active.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
  // Displayed expiry = soonest expiry among batches that still hold stock;
  // a depleted batch must not keep warning about itself forever.
  const dates = active
    .filter((b) => (Number(b.qty) || 0) > 0)
    .map((b) => (b.expiryDate ? String(b.expiryDate).slice(0, 10) : null))
    .filter(Boolean)
    .sort();
  product.expiryDate = dates[0] || null;
}

const mapBatchIn = (data) => ({
  batchNo: clamp(sanitize(data.batchNo || ''), 60),
  expiryDate: data.expiryDate || null,
  qty: Math.max(0, Math.floor(Number(data.qty) || 0)),
  costPrice: Math.max(0, Number(data.costPrice) || 0),
  supplier: clamp(sanitize(data.supplier || ''), 120),
  status: ['active', 'quarantined', 'recalled'].includes(data.status)
    ? data.status
    : 'active',
});

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
        // The designated administrator never waits in the local approval queue,
        // and neither do the seeded demo accounts (Demo Supermart and the
        // Healthway Pharmacy demo).
        approvalStatus:
          isSuperAdminEmail(normalized) ||
          normalized === 'demo@smartstoreng.com' ||
          normalized === 'pharmacy.demo@smartstoreng.com'
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
    // Local demo mode has no bearer token; the assistant falls back to its
    // offline insight engine when the optional server endpoint is unavailable.
    async getAccessToken() {
      return null;
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
      if (db.members.some((m) => m.userId === userId && m.storeId === store.id)) {
        const member = db.members.find((m) => m.userId === userId);
        return {
          store,
          role: member.role,
          approvalStatus: approvalStatus(member),
        };
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
        genericName: clamp(sanitize(data.genericName || ''), 200),
        strength: clamp(sanitize(data.strength || ''), 60),
        dosageForm: clamp(sanitize(data.dosageForm || ''), 60),
        packSize: clamp(sanitize(data.packSize || ''), 60),
        isRx: Boolean(data.isRx),
        isControlled: Boolean(data.isControlled),
        createdAt: new Date().toISOString(),
      };
      db.products.push(product);

      // Pharmacy products open life with their first batch, so stock and
      // expiry are batch-tracked from the very first unit.
      const opening = data.openingBatch;
      if (opening && Math.floor(Number(opening.qty) || 0) > 0) {
        const batch = {
          id: uid(),
          storeId,
          productId: product.id,
          receivedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          ...mapBatchIn({ ...opening, status: 'active' }),
        };
        db.batches = db.batches || [];
        db.batches.push(batch);
        syncProductStock(db, product.id);
      }

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
      if (clean.genericName !== undefined) clean.genericName = clamp(sanitize(clean.genericName || ''), 200);
      if (clean.strength !== undefined) clean.strength = clamp(sanitize(clean.strength || ''), 60);
      if (clean.dosageForm !== undefined) clean.dosageForm = clamp(sanitize(clean.dosageForm || ''), 60);
      if (clean.packSize !== undefined) clean.packSize = clamp(sanitize(clean.packSize || ''), 60);
      if (clean.isRx !== undefined) clean.isRx = Boolean(clean.isRx);
      if (clean.isControlled !== undefined) clean.isControlled = Boolean(clean.isControlled);

      // Batch-tracked products own their stock through batches; a direct
      // stock write would be overwritten by the next batch change anyway.
      const hasBatches = (db.batches || []).some((b) => b.productId === id);
      if (hasBatches && clean.stock !== undefined) delete clean.stock;
      if (hasBatches && clean.expiryDate !== undefined) delete clean.expiryDate;

      db.products[idx] = { ...db.products[idx], ...clean };
      save(db);
      return db.products[idx];
    },
    async remove(id) {
      const db = load();
      db.products = db.products.filter((p) => p.id !== id);
      db.batches = (db.batches || []).filter((b) => b.productId !== id);
      save(db);
    },
  },

  // Pharmacy stock lives in batches: batch number, expiry, quantity, cost
  // and supplier per delivery. Batches are what sales allocate FEFO from
  // and what recalls and expiry reports point at.
  batches: {
    async list(storeId) {
      return (load().batches || [])
        .filter((b) => b.storeId === storeId)
        .sort(
          (a, b) =>
            String(a.expiryDate || '9999-12-31').localeCompare(
              String(b.expiryDate || '9999-12-31')
            ) || new Date(a.receivedAt) - new Date(b.receivedAt)
        );
    },
    async add(storeId, data) {
      const db = load();
      const product = db.products.find(
        (p) => p.id === data.productId && p.storeId === storeId
      );
      if (!product) throw new Error('Product not found');

      const batch = {
        id: uid(),
        storeId,
        productId: product.id,
        receivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        ...mapBatchIn(data),
      };
      if (batch.qty <= 0) throw new Error('Received quantity must be at least 1.');

      db.batches = db.batches || [];
      db.batches.push(batch);
      syncProductStock(db, product.id);
      save(db);
      return batch;
    },
    async update(id, patch) {
      const db = load();
      const idx = (db.batches || []).findIndex((b) => b.id === id);
      if (idx === -1) throw new Error('Batch not found');

      db.batches[idx] = {
        ...db.batches[idx],
        ...mapBatchIn({ ...db.batches[idx], ...patch }),
      };
      syncProductStock(db, db.batches[idx].productId);
      save(db);
      return db.batches[idx];
    },
    async remove(id) {
      const db = load();
      const batch = (db.batches || []).find((b) => b.id === id);
      if (!batch) throw new Error('Batch not found');
      db.batches = db.batches.filter((b) => b.id !== id);
      syncProductStock(db, batch.productId);
      save(db);
      return batch;
    },
  },

  sales: {
    async list(storeId) {
      return load()
        .sales.filter((s) => s.storeId === storeId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async create(storeId, { items, paymentMethod, receiptNo, cashierEmail, trackStock, amountPaid, customerName, verifiedBy }) {
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
        const batchAllocations = new Map();
        for (const item of items) {
          const product = db.products.find((p) => p.id === item.productId);
          if (!product) throw new Error(`Product not found: ${item.name}`);
          const productBatches = (db.batches || []).filter(
            (b) => b.productId === item.productId
          );
          if (productBatches.length > 0) {
            // Batch-tracked medicine: in-date, active batches only.
            const { allocations, remaining } = allocateFefo(productBatches, item.qty);
            if (remaining > 0) {
              throw new Error(
                `Insufficient in-date stock for ${item.name} (short by ${remaining} units; expired or quarantined batches do not count)`
              );
            }
            batchAllocations.set(item.productId, allocations);
          } else if ((product.stock ?? 0) - item.qty < 0) {
            throw new Error(`Insufficient stock for ${item.name}`);
          }
        }
        // Second pass: decrement
        for (const item of items) {
          const product = db.products.find((p) => p.id === item.productId);
          const allocations = batchAllocations.get(item.productId);
          if (allocations) {
            for (const alloc of allocations) {
              const batch = db.batches.find((b) => b.id === alloc.batchId);
              batch.qty = (Number(batch.qty) || 0) - alloc.qty;
            }
            syncProductStock(db, item.productId);
          } else {
            product.stock = (product.stock ?? 0) - item.qty;
          }
        }
        // The allocation travels on the line item so receipts, recalls and
        // voids can trace exact batches (mirrors the create_sale RPC).
        for (const item of items) {
          const allocations = batchAllocations.get(item.productId);
          if (allocations) item.batches = allocations;
        }
      }

      const allowedMethods = ['Cash', 'Transfer', 'POS/Card', 'Partial', 'Credit'];
      const method = allowedMethods.includes(paymentMethod)
        ? paymentMethod
        : 'Cash';

      const total = items.reduce((sum, i) => sum + (Number(i.lineTotal) || 0), 0);

      // Partial / Credit sales leave money outstanding against a named
      // customer; everything else is paid in full at the till.
      let paid = total;
      let customer = '';
      if (method === 'Partial' || method === 'Credit') {
        customer = clamp(sanitize(customerName || ''), 100);
        if (!customer) {
          throw new Error("Enter the customer's name so the debt can be tracked.");
        }
        if (method === 'Credit') {
          paid = 0;
        } else {
          paid = Number(amountPaid);
          if (!Number.isFinite(paid) || paid <= 0) {
            throw new Error('Enter how much the customer is paying now.');
          }
          if (paid >= total) {
            throw new Error('Amount paid must be less than the sale total for a partial payment.');
          }
        }
      }

      const sale = {
        id: uid(),
        storeId,
        receiptNo: clamp(sanitize(receiptNo), 30),
        paymentMethod: method,
        cashierEmail: clamp(sanitize(cashierEmail || ''), 200),
        // Phase 3: which pharmacist verified the prescription check for
        // Rx / controlled lines ('' when the sale had none to verify).
        verifiedBy: clamp(sanitize(verifiedBy || ''), 200),
        status: 'completed',
        amountPaid: paid,
        customerName: customer,
        items: items.map((i) => ({
          productId: i.productId,
          name: clamp(sanitize(i.name), 200),
          qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
          price: Math.max(0, Number(i.price) || 0),
          lineTotal: Math.max(0, Number(i.lineTotal) || 0),
          ...(i.isRx ? { isRx: true } : {}),
          ...(i.isControlled ? { isControlled: true } : {}),
          ...(Array.isArray(i.batches)
            ? {
                batches: i.batches.map((a) => ({
                  batchId: a.batchId,
                  batchNo: clamp(sanitize(a.batchNo || ''), 60),
                  expiryDate: a.expiryDate || null,
                  qty: Math.max(0, Math.floor(Number(a.qty) || 0)),
                })),
              }
            : {}),
        })),
        total,
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
          // Batch-tracked lines go back to the exact batches they left. If
          // the originating batch was deleted since the sale, those units
          // fall back to plain product stock so nothing is silently lost.
          if (Array.isArray(item.batches) && item.batches.length > 0) {
            let orphanQty = 0;
            for (const alloc of item.batches) {
              const batch = (db.batches || []).find((b) => b.id === alloc.batchId);
              if (batch) {
                batch.qty = (Number(batch.qty) || 0) + (Number(alloc.qty) || 0);
              } else {
                orphanQty += Number(alloc.qty) || 0;
              }
            }
            syncProductStock(db, item.productId);
            if (orphanQty > 0) {
              const product = db.products.find((p) => p.id === item.productId);
              if (product) {
                product.stock = (Number(product.stock) || 0) + orphanQty;
              }
            }
          } else {
            const product = db.products.find((p) => p.id === item.productId);
            if (product) product.stock = (product.stock ?? 0) + item.qty;
          }
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

  // Repayments against partial / credit sales. Each record is appended to the
  // ledger and the sale's amountPaid moves with it, so a sale's outstanding
  // balance is always total - amountPaid and the full history survives.
  creditPayments: {
    async list(storeId) {
      const db = load();
      return (db.creditPayments || [])
        .filter((p) => p.storeId === storeId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async add(storeId, { saleId, amount, method, note, receivedBy }) {
      const db = load();
      const sale = db.sales.find((s) => s.id === saleId && s.storeId === storeId);
      if (!sale) throw new Error('Sale not found');
      if (sale.status === 'voided') throw new Error('This sale was voided.');

      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Enter a valid payment amount.');
      }
      // Sales recorded before the credit feature have no amountPaid; they
      // were settled at the till, so treat them as paid in full.
      const paidSoFar =
        sale.amountPaid == null ? Number(sale.total) || 0 : Number(sale.amountPaid) || 0;
      const balance = Math.max(0, (Number(sale.total) || 0) - paidSoFar);
      if (balance <= 0) throw new Error('This debt is already settled.');
      if (value > balance) {
        throw new Error(`Payment is more than the outstanding balance of ${balance}.`);
      }

      const allowedMethods = ['Cash', 'Transfer', 'POS/Card'];
      const payment = {
        id: uid(),
        storeId,
        saleId: sale.id,
        receiptNo: sale.receiptNo,
        customerName: sale.customerName || '',
        amount: value,
        method: allowedMethods.includes(method) ? method : 'Cash',
        note: clamp(sanitize(note || ''), 500),
        receivedBy: clamp(sanitize(receivedBy || ''), 200),
        createdAt: new Date().toISOString(),
      };
      db.creditPayments = db.creditPayments || [];
      db.creditPayments.push(payment);
      sale.amountPaid = paidSoFar + value;
      save(db);
      return payment;
    },

    async remove(id) {
      const db = load();
      const payment = (db.creditPayments || []).find((p) => p.id === id);
      if (!payment) throw new Error('Payment record not found');
      db.creditPayments = db.creditPayments.filter((p) => p.id !== id);
      // Reverse the repayment on the sale so the balance opens up again.
      const sale = db.sales.find((s) => s.id === payment.saleId);
      if (sale) {
        sale.amountPaid = Math.max(0, (Number(sale.amountPaid) || 0) - payment.amount);
      }
      save(db);
      return payment;
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

  // ------------------------------------------------------------------
  // Pharmacy Phase 2: suppliers, purchase receiving, prescriptions.
  // Mirrors 011_pharmacy_operations.sql; purchases create their batches in
  // the same save (the RPC's one-transaction promise), and dispensing a
  // prescription runs through the normal sale engine so FEFO, receipts and
  // voids all behave exactly like a till sale.
  // ------------------------------------------------------------------

  suppliers: {
    async list(storeId) {
      return (load().suppliers || [])
        .filter((s) => s.storeId === storeId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async create(storeId, data) {
      const cleanName = clamp(sanitize(data.name), 120);
      if (!cleanName) throw new Error('Supplier name is required.');
      const db = load();
      const supplier = {
        id: uid(),
        storeId,
        name: cleanName,
        phone: clamp(sanitize(data.phone || ''), 40),
        email: clamp(sanitize(data.email || ''), 120),
        address: clamp(sanitize(data.address || ''), 200),
        notes: clamp(sanitize(data.notes || ''), 500),
        createdAt: new Date().toISOString(),
      };
      db.suppliers = db.suppliers || [];
      db.suppliers.push(supplier);
      save(db);
      return supplier;
    },
    async update(id, patch) {
      const db = load();
      const idx = (db.suppliers || []).findIndex((s) => s.id === id);
      if (idx === -1) throw new Error('Supplier not found');
      const clean = { ...patch };
      if (clean.name !== undefined) clean.name = clamp(sanitize(clean.name), 120);
      if (clean.phone !== undefined) clean.phone = clamp(sanitize(clean.phone || ''), 40);
      if (clean.email !== undefined) clean.email = clamp(sanitize(clean.email || ''), 120);
      if (clean.address !== undefined) clean.address = clamp(sanitize(clean.address || ''), 200);
      if (clean.notes !== undefined) clean.notes = clamp(sanitize(clean.notes || ''), 500);
      db.suppliers[idx] = { ...db.suppliers[idx], ...clean };
      save(db);
      return db.suppliers[idx];
    },
    async remove(id) {
      const db = load();
      db.suppliers = (db.suppliers || []).filter((s) => s.id !== id);
      // Purchases keep their record with the supplier detached.
      (db.purchases || []).forEach((p) => {
        if (p.supplierId === id) p.supplierId = null;
      });
      save(db);
    },
  },

  purchases: {
    async list(storeId) {
      return (load().purchases || [])
        .filter((p) => p.storeId === storeId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    async create(storeId, { supplierId, reference, items, receivedBy }) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('A delivery needs at least one line.');
      }
      const db = load();

      const recordedItems = [];
      let total = 0;
      for (const line of items) {
        const product = db.products.find(
          (p) => p.id === line.productId && p.storeId === storeId
        );
        if (!product) throw new Error(`Product not found for delivery line: ${line.name || ''}`);
        const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
        if (qty < 1) throw new Error('Every delivery line needs a quantity of at least 1.');
        const unitCost = Math.max(0, Number(line.unitCost) || 0);

        const batch = {
          id: uid(),
          storeId,
          productId: product.id,
          receivedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          ...mapBatchIn({
            batchNo: line.batchNo,
            expiryDate: line.expiryDate,
            qty,
            costPrice: unitCost,
            supplier: line.supplier || '',
            status: 'active',
          }),
        };
        db.batches = db.batches || [];
        db.batches.push(batch);
        syncProductStock(db, product.id);

        total += qty * unitCost;
        recordedItems.push({
          productId: product.id,
          name: product.name,
          qty,
          unitCost,
          lineTotal: qty * unitCost,
          batchId: batch.id,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
        });
      }

      const purchase = {
        id: uid(),
        storeId,
        supplierId: supplierId || null,
        reference: clamp(sanitize(reference || ''), 60),
        status: 'received',
        items: recordedItems,
        total,
        receivedBy: clamp(sanitize(receivedBy || ''), 200),
        createdAt: new Date().toISOString(),
      };
      db.purchases = db.purchases || [];
      db.purchases.push(purchase);
      save(db);
      return purchase;
    },
    async remove(id) {
      // The purchase ledger row only. Physical stock (the batches it
      // created) is managed from the batch drawer, not by deleting records.
      const db = load();
      db.purchases = (db.purchases || []).filter((p) => p.id !== id);
      save(db);
      return id;
    },
  },

  prescriptions: {
    async list(storeId) {
      const db = load();
      return (db.prescriptions || [])
        .filter((r) => r.storeId === storeId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((r) => ({
          ...r,
          items: (db.prescriptionItems || []).filter(
            (i) => i.prescriptionId === r.id
          ),
        }));
    },

    async create(storeId, { patientName, patientPhone, patientAge, prescriber, notes, items, createdBy }) {
      const cleanPatient = clamp(sanitize(patientName), 120);
      if (!cleanPatient) throw new Error('Patient name is required.');
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Add at least one prescribed medicine.');
      }

      const db = load();
      const prescription = {
        id: uid(),
        storeId,
        code: 'RX-' + Date.now().toString(36).toUpperCase().slice(-6),
        patientName: cleanPatient,
        patientPhone: clamp(sanitize(patientPhone || ''), 40),
        patientAge: clamp(sanitize(patientAge || ''), 20),
        prescriber: clamp(sanitize(prescriber || ''), 120),
        notes: clamp(sanitize(notes || ''), 500),
        status: 'open',
        createdBy: clamp(sanitize(createdBy || ''), 200),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.prescriptions = db.prescriptions || [];
      db.prescriptions.push(prescription);

      db.prescriptionItems = db.prescriptionItems || [];
      for (const line of items) {
        const product = db.products.find(
          (p) => p.id === line.productId && p.storeId === storeId
        );
        if (!product) throw new Error(`Product not found: ${line.name || ''}`);
        const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
        if (qty < 1) throw new Error('Every prescribed line needs a quantity of at least 1.');
        db.prescriptionItems.push({
          id: uid(),
          prescriptionId: prescription.id,
          productId: product.id,
          productName: product.name,
          prescribedQty: qty,
          dispensedQty: 0,
        });
      }
      save(db);
      return { ...prescription, items: db.prescriptionItems.filter((i) => i.prescriptionId === prescription.id) };
    },

    async cancel(id) {
      const db = load();
      const rx = (db.prescriptions || []).find((r) => r.id === id);
      if (!rx) throw new Error('Prescription not found');
      if (rx.status === 'dispensed') {
        throw new Error('This prescription has already been fully dispensed.');
      }
      rx.status = 'cancelled';
      rx.updatedAt = new Date().toISOString();
      save(db);
      return rx;
    },

    async remove(id) {
      const db = load();
      db.prescriptions = (db.prescriptions || []).filter((r) => r.id !== id);
      db.prescriptionItems = (db.prescriptionItems || []).filter(
        (i) => i.prescriptionId !== id
      );
      db.dispensings = (db.dispensings || []).filter((d) => d.prescriptionId !== id);
      save(db);
      return id;
    },

    /**
     * Dispense (part of) a prescription: runs a real sale through the FEFO
     * engine, advances each line's dispensed quantity, and appends the
     * dispensing event linking the receipt and its batch allocation. All in
     * one save, so the prescription and the till always agree.
     */
    async dispense(
      storeId,
      { prescriptionId, lines, paymentMethod, cashierEmail, verifiedBy }
    ) {
      if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error('Select at least one medicine to dispense.');
      }
      const db = load();
      const rx = (db.prescriptions || []).find(
        (r) => r.id === prescriptionId && r.storeId === storeId
      );
      if (!rx) throw new Error('Prescription not found');
      if (rx.status !== 'open') {
        throw new Error('This prescription is not open for dispensing.');
      }

      const rxItems = (db.prescriptionItems || []).filter(
        (i) => i.prescriptionId === prescriptionId
      );

      // Validate the requested lines against what remains on the script.
      for (const line of lines) {
        const item = rxItems.find((i) => i.productId === line.productId);
        if (!item) throw new Error('That medicine is not on this prescription.');
        const remaining = item.prescribedQty - item.dispensedQty;
        const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
        if (qty < 1) throw new Error('Every line needs a quantity of at least 1.');
        if (qty > remaining) {
          throw new Error(
            `Only ${remaining} of ${item.productName} remain on this prescription.`
          );
        }
      }

      const saleItems = lines.map((line) => {
        const product = db.products.find((p) => p.id === line.productId);
        if (!product) throw new Error('Product not found');
        const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
        return {
          productId: product.id,
          name: product.name,
          qty,
          price: product.salePrice,
          lineTotal: product.salePrice * qty,
          ...(product.isRx ? { isRx: true } : {}),
          ...(product.isControlled ? { isControlled: true } : {}),
        };
      });

      // Reuse the sale engine: FEFO allocation, stock checks, receipt.
      // Dispensing settles at pickup: Cash, Transfer or POS/Card. Anything
      // the patient should owe on goes through the till instead.
      const method = ['Cash', 'Transfer', 'POS/Card'].includes(paymentMethod)
        ? paymentMethod
        : 'Cash';
      const sale = await localAdapter.sales.create(storeId, {
        items: saleItems,
        paymentMethod: method,
        receiptNo: 'SM-' + Date.now().toString().slice(-8),
        cashierEmail: cashierEmail || '',
        trackStock: true,
        verifiedBy: verifiedBy || '',
      });

      // sales.create() loads and saves its own snapshot, so re-read the
      // freshest state before advancing the prescription.
      const fresh = load();
      const freshRx = fresh.prescriptions.find((r) => r.id === prescriptionId);
      const freshItems = (fresh.prescriptionItems || []).filter(
        (i) => i.prescriptionId === prescriptionId
      );
      for (const line of lines) {
        const item = freshItems.find((i) => i.productId === line.productId);
        item.dispensedQty += Math.max(1, Math.floor(Number(line.qty) || 1));
      }
      const fullyDispensed = freshItems.every(
        (i) => i.dispensedQty >= i.prescribedQty
      );
      freshRx.status = fullyDispensed ? 'dispensed' : 'open';
      freshRx.updatedAt = new Date().toISOString();

      fresh.dispensings = fresh.dispensings || [];
      fresh.dispensings.push({
        id: uid(),
        storeId,
        prescriptionId,
        saleId: sale.id,
        receiptNo: sale.receiptNo,
        items: sale.items,
        dispensedBy: clamp(sanitize(cashierEmail || ''), 200),
        createdAt: new Date().toISOString(),
      });
      save(fresh);
      return { sale, prescription: { ...freshRx, items: freshItems } };
    },

    dispensings: {
      async list(storeId) {
        return (load().dispensings || [])
          .filter((d) => d.storeId === storeId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      },
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
      // Shop Mode team limits (one cashier, one manager, no admins): the
      // local mirror of the Postgres trigger in 008_owner_modes.sql.
      const store = db.stores.find((s) => s.id === m.storeId);
      const limitError = checkTeamChange({
        plan: store?.plan,
        storeIsDemo: store?.isDemo,
        members: db.members.filter((x) => x.storeId === m.storeId),
        member: m,
        nextRole: role,
      });
      if (limitError) throw limitError;
      m.role = role;
      save(db);
      return m;
    },
    // Phase 3: mark which team members are licensed pharmacists. Roles say
    // what someone can do in the app; this says who may verify a
    // prescription check at the till. Either flag is independent of role.
    async setPharmacist(memberId, isPharmacist) {
      const db = load();
      const m = db.members.find((x) => x.id === memberId);
      if (!m) throw new Error('Member not found');
      m.isPharmacist = Boolean(isPharmacist);
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
      if (status === 'approved') {
        const store = db.stores.find((s) => s.id === m.storeId);
        const limitError = checkTeamChange({
          plan: store?.plan,
          storeIsDemo: store?.isDemo,
          members: db.members.filter((x) => x.storeId === m.storeId),
          member: m,
          nextStatus: 'approved',
        });
        if (limitError) throw limitError;
      }
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
      db.batches = (db.batches || []).filter((item) => item.storeId !== storeId);
      db.suppliers = (db.suppliers || []).filter((item) => item.storeId !== storeId);
      db.purchases = (db.purchases || []).filter((item) => item.storeId !== storeId);
      const prescriptionIds = new Set(
        (db.prescriptions || [])
          .filter((item) => item.storeId === storeId)
          .map((item) => item.id)
      );
      db.prescriptions = (db.prescriptions || []).filter((item) => item.storeId !== storeId);
      db.prescriptionItems = (db.prescriptionItems || []).filter(
        (item) => !prescriptionIds.has(item.prescriptionId)
      );
      db.dispensings = (db.dispensings || []).filter((item) => item.storeId !== storeId);
      db.sales = db.sales.filter((item) => item.storeId !== storeId);
      db.expenses = db.expenses.filter((item) => item.storeId !== storeId);
      db.creditPayments = (db.creditPayments || []).filter((item) => item.storeId !== storeId);
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
