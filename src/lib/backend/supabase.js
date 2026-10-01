// src/lib/backend/supabase.js
// Supabase adapter. Activated when VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY are present. Schema: supabase/migrations/001_init.sql
import { createClient } from '@supabase/supabase-js';
import { sanitize, clamp } from '../validate';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;

const mapStore = (s) =>
  s && {
    id: s.id,
    name: s.name,
    type: s.type,
    plan: s.plan,
    billingCycle: s.billing_cycle || null,
    isDemo: s.is_demo,
    joinCode: s.join_code,
    onboarding: s.onboarding || {},
    createdAt: s.created_at,
  };

const mapProduct = (p) =>
  p && {
    id: p.id,
    storeId: p.store_id,
    name: p.name,
    sku: p.sku || '',
    category: p.category || 'General',
    costPrice: Number(p.cost_price || 0),
    salePrice: Number(p.sale_price || 0),
    stock: Number(p.stock || 0),
    expiryDate: p.expiry_date || null,
    genericName: p.generic_name || '',
    strength: p.strength || '',
    dosageForm: p.dosage_form || '',
    packSize: p.pack_size || '',
    isRx: Boolean(p.is_rx),
    isControlled: Boolean(p.is_controlled),
    createdAt: p.created_at,
  };

// Pharmacy batch row (010_pharmacy_mode.sql) → client shape.
const mapBatch = (b) =>
  b && {
    id: b.id,
    storeId: b.store_id,
    productId: b.product_id,
    batchNo: b.batch_no || '',
    expiryDate: b.expiry_date || null,
    qty: Number(b.qty || 0),
    costPrice: Number(b.cost_price || 0),
    supplier: b.supplier || '',
    status: b.status || 'active',
    receivedAt: b.received_at,
    createdAt: b.created_at,
  };

const mapSupplier = (s) =>
  s && {
    id: s.id,
    storeId: s.store_id,
    name: s.name,
    phone: s.phone || '',
    email: s.email || '',
    address: s.address || '',
    notes: s.notes || '',
    createdAt: s.created_at,
  };

const mapPurchase = (p) =>
  p && {
    id: p.id,
    storeId: p.store_id,
    supplierId: p.supplier_id || null,
    reference: p.reference || '',
    status: p.status || 'received',
    items: p.items || [],
    total: Number(p.total || 0),
    receivedBy: p.received_by || '',
    createdAt: p.created_at,
  };

const mapPrescription = (r, items = []) =>
  r && {
    id: r.id,
    storeId: r.store_id,
    code: r.code || '',
    patientName: r.patient_name || '',
    patientPhone: r.patient_phone || '',
    patientAge: r.patient_age || '',
    prescriber: r.prescriber || '',
    notes: r.notes || '',
    status: r.status || 'open',
    createdBy: r.created_by || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    items: items.map(mapPrescriptionItem),
  };

const mapPrescriptionItem = (i) =>
  i && {
    id: i.id,
    prescriptionId: i.prescription_id,
    productId: i.product_id,
    productName: i.product_name || '',
    prescribedQty: Number(i.prescribed_qty || 0),
    dispensedQty: Number(i.dispensed_qty || 0),
  };

const mapDispensing = (d) =>
  d && {
    id: d.id,
    storeId: d.store_id,
    prescriptionId: d.prescription_id,
    saleId: d.sale_id || null,
    receiptNo: d.receipt_no || '',
    items: d.items || [],
    dispensedBy: d.dispensed_by || '',
    createdAt: d.created_at,
  };

const mapSale = (s) =>
  s && {
    id: s.id,
    storeId: s.store_id,
    receiptNo: s.receipt_no,
    paymentMethod: s.payment_method,
    cashierEmail: s.cashier_email || '',
    verifiedBy: s.verified_by || '',
    status: s.status,
    amountPaid: s.amount_paid == null ? Number(s.total || 0) : Number(s.amount_paid),
    customerName: s.customer_name || '',
    items: s.items || [],
    total: Number(s.total || 0),
    createdAt: s.created_at,
  };

const mapCreditPayment = (p) =>
  p && {
    id: p.id,
    storeId: p.store_id,
    saleId: p.sale_id,
    receiptNo: p.receipt_no || '',
    customerName: p.customer_name || '',
    amount: Number(p.amount || 0),
    method: p.method || 'Cash',
    note: p.note || '',
    receivedBy: p.received_by || '',
    createdAt: p.created_at,
  };

const mapExpense = (e) =>
  e && {
    id: e.id,
    storeId: e.store_id,
    title: e.title,
    amount: Number(e.amount || 0),
    category: e.category || 'General',
    note: e.note || '',
    date: e.date,
    createdAt: e.created_at,
  };

const mapVoidLog = (v) =>
  v && {
    id: v.id,
    storeId: v.store_id,
    saleId: v.sale_id,
    receiptNo: v.receipt_no,
    total: Number(v.total || 0),
    reason: v.reason,
    voidedBy: v.voided_by || '',
    createdAt: v.created_at,
  };

const mapMember = (m) =>
  m && {
    id: m.id,
    storeId: m.store_id,
    userId: m.user_id,
    email: m.email,
    role: m.role,
    isPharmacist: Boolean(m.is_pharmacist),
    approvalStatus: m.approval_status || 'approved',
    createdAt: m.created_at,
  };

function ensure(error) {
  if (error) throw new Error(error.message);
}

// Auth error codes/statuses that mean "this token no longer maps to a real,
// usable account" -- the account was deleted (directly in Supabase, or via
// the super-admin "Delete user" action), banned, or the session was revoked
// server-side. A token like that must never keep acting as a valid session:
// that is what let a deleted account quietly land back in onboarding
// ("looks like you already have a store... actually no, set one up") instead
// of the login screen. It is distinct from a network hiccup, which should
// NOT sign the user out.
const REVOKED_ACCOUNT_ERROR_CODES = new Set([
  'user_not_found',
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
]);

export function isRevokedAccountError(error) {
  if (!error) return false;
  if (REVOKED_ACCOUNT_ERROR_CODES.has(error.code)) return true;
  // Older/self-hosted GoTrue versions don't always set `code`; fall back to
  // the status + message shape they use instead.
  return (
    (error.status === 403 || error.status === 404) &&
    /does not exist|not found/i.test(error.message || '')
  );
}

export const supabaseAdapter = {
  kind: 'supabase',

  auth: {
    async signUp({ email, password }) {
      const redirectTo =
        typeof window !== 'undefined' ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });
      ensure(error);
      return { id: data.user.id, email: data.user.email };
    },
    async signIn({ email, password }) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      ensure(error);
      return { id: data.user.id, email: data.user.email };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async getAccessToken() {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    },
    async getUser() {
      // getSession() only reads (and, if near expiry, refreshes) the local
      // token -- it never checks whether the account behind it still
      // exists. Keep it as the fast path/fallback, but also ask the Auth
      // server to actually resolve the current user so a token for an
      // account that was deleted server-side gets caught here instead of
      // silently continuing to "work" for the rest of its lifetime.
      const { data: sessionData } = await supabase.auth.getSession();
      const cached = sessionData?.session?.user;
      if (!cached) return null;

      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (isRevokedAccountError(error)) {
          await supabase.auth.signOut();
          return null;
        }
        // Some other failure verifying the session (offline, a timed-out
        // request, ...): trust the cached, already-refreshed-if-needed
        // session rather than forcing a sign-out over a network blip.
        return { id: cached.id, email: cached.email };
      }
      const u = data?.user;
      return u ? { id: u.id, email: u.email } : null;
    },
    onChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user;
        cb(u ? { id: u.id, email: u.email } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  },

  stores: {
    async getMyMembership(userId) {
      // The RPC can return a pending user's own membership without opening up
      // store data through RLS. The userId argument keeps this adapter aligned
      // with the local interface; the server always uses auth.uid().
      if (!userId) return null;
      const { data, error } = await supabase.rpc('get_my_membership');
      ensure(error);
      if (!data?.store) return null;
      return {
        store: mapStore(data.store),
        role: data.role,
        approvalStatus: data.approval_status || 'approved',
      };
    },

    async create(userId, email, { name, type, categories }) {
      const cleanName = clamp(sanitize(name), 100);
      if (!cleanName) throw new Error('Store name is required.');
      const { data, error } = await supabase.rpc('create_store', {
        p_name: cleanName,
        p_type: sanitize(type) || 'other',
        p_categories: (categories || []).map((c) => clamp(sanitize(c), 100)).filter(Boolean),
      });
      ensure(error);
      return mapStore(data);
    },

    async update(storeId, patch) {
      const row = {};
      if (patch.name !== undefined) row.name = clamp(sanitize(patch.name), 100);
      if (patch.type !== undefined) row.type = sanitize(patch.type);
      if (patch.plan !== undefined) row.plan = patch.plan;
      if (patch.billingCycle !== undefined) row.billing_cycle = patch.billingCycle;
      if (patch.onboarding !== undefined) {
        const { data: existing } = await supabase
          .from('stores')
          .select('onboarding')
          .eq('id', storeId)
          .single();
        row.onboarding = { ...(existing?.onboarding || {}), ...patch.onboarding };
      }
      const { data, error } = await supabase
        .from('stores')
        .update(row)
        .eq('id', storeId)
        .select()
        .single();
      ensure(error);
      return mapStore(data);
    },

    async joinWithCode(userId, email, code) {
      const cleanCode = sanitize(code).toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
        throw new Error('Invalid join code format.');
      }
      const { data, error } = await supabase.rpc('join_store_with_code', {
        p_code: cleanCode,
      });
      ensure(error);
      return {
        store: mapStore(data),
        role: 'cashier',
        approvalStatus: 'pending',
      };
    },
  },

  categories: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
      ensure(error);
      return data.map((c) => ({ id: c.id, storeId: c.store_id, name: c.name }));
    },
    async add(storeId, name) {
      const { data, error } = await supabase
        .from('categories')
        .insert({ store_id: storeId, name })
        .select()
        .single();
      ensure(error);
      return { id: data.id, storeId: data.store_id, name: data.name };
    },
    async remove(id) {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      ensure(error);
    },
  },

  products: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
      ensure(error);
      return data.map(mapProduct);
    },
    async create(storeId, d) {
      const cleanName = clamp(sanitize(d.name), 200);
      if (!cleanName) throw new Error('Product name is required.');

      // Pharmacy products are created through an RPC so the product and its
      // opening batch land atomically, and the batch trigger folds the
      // opening quantity into products.stock server-side.
      if (d.openingBatch && Math.floor(Number(d.openingBatch.qty) || 0) > 0) {
        const b = d.openingBatch;
        const { data, error } = await supabase.rpc('create_pharmacy_product', {
          p_store_id: storeId,
          p_name: cleanName,
          p_sku: clamp(sanitize(d.sku || ''), 50),
          p_category: clamp(sanitize(d.category || 'General'), 100),
          p_cost_price: Math.max(0, Number(d.costPrice) || 0),
          p_sale_price: Math.max(0, Number(d.salePrice) || 0),
          p_generic_name: clamp(sanitize(d.genericName || ''), 200),
          p_strength: clamp(sanitize(d.strength || ''), 60),
          p_dosage_form: clamp(sanitize(d.dosageForm || ''), 60),
          p_pack_size: clamp(sanitize(d.packSize || ''), 60),
          p_is_rx: Boolean(d.isRx),
          p_is_controlled: Boolean(d.isControlled),
          p_batch: {
            batchNo: clamp(sanitize(b.batchNo || ''), 60) || 'OPENING',
            expiryDate: b.expiryDate || null,
            qty: Math.max(0, Math.floor(Number(b.qty) || 0)),
            costPrice: Math.max(0, Number(b.costPrice) || 0),
            supplier: clamp(sanitize(b.supplier || ''), 120),
          },
        });
        ensure(error);
        return mapProduct(data);
      }

      const { data, error } = await supabase
        .from('products')
        .insert({
          store_id: storeId,
          name: cleanName,
          sku: clamp(sanitize(d.sku || ''), 50),
          category: clamp(sanitize(d.category || 'General'), 100),
          cost_price: Math.max(0, Number(d.costPrice) || 0),
          sale_price: Math.max(0, Number(d.salePrice) || 0),
          stock: Math.max(0, Math.floor(Number(d.stock) || 0)),
          expiry_date: d.expiryDate || null,
          generic_name: clamp(sanitize(d.genericName || ''), 200),
          strength: clamp(sanitize(d.strength || ''), 60),
          dosage_form: clamp(sanitize(d.dosageForm || ''), 60),
          pack_size: clamp(sanitize(d.packSize || ''), 60),
          is_rx: Boolean(d.isRx),
          is_controlled: Boolean(d.isControlled),
        })
        .select()
        .single();
      ensure(error);
      return mapProduct(data);
    },
    async update(id, patch) {
      const row = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.sku !== undefined) row.sku = patch.sku;
      if (patch.category !== undefined) row.category = patch.category;
      if (patch.costPrice !== undefined) row.cost_price = patch.costPrice;
      if (patch.salePrice !== undefined) row.sale_price = patch.salePrice;
      if (patch.stock !== undefined) row.stock = patch.stock;
      if (patch.expiryDate !== undefined) row.expiry_date = patch.expiryDate;
      if (patch.genericName !== undefined) row.generic_name = patch.genericName;
      if (patch.strength !== undefined) row.strength = patch.strength;
      if (patch.dosageForm !== undefined) row.dosage_form = patch.dosageForm;
      if (patch.packSize !== undefined) row.pack_size = patch.packSize;
      if (patch.isRx !== undefined) row.is_rx = patch.isRx;
      if (patch.isControlled !== undefined) row.is_controlled = patch.isControlled;
      const { data, error } = await supabase
        .from('products')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      ensure(error);
      return mapProduct(data);
    },
    async remove(id) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      ensure(error);
    },
  },

  // Pharmacy batches. Writes go straight through RLS (managers and above);
  // the sync trigger keeps products.stock / expiry_date consistent after
  // every change, mirroring the local adapter.
  batches: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('product_batches')
        .select('*')
        .eq('store_id', storeId)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('received_at', { ascending: true });
      ensure(error);
      return data.map(mapBatch);
    },
    async add(storeId, d) {
      const qty = Math.floor(Number(d.qty) || 0);
      if (qty < 1) throw new Error('Received quantity must be at least 1.');
      const { data, error } = await supabase
        .from('product_batches')
        .insert({
          store_id: storeId,
          product_id: d.productId,
          batch_no: clamp(sanitize(d.batchNo || ''), 60) || 'OPENING',
          expiry_date: d.expiryDate || null,
          qty,
          cost_price: Math.max(0, Number(d.costPrice) || 0),
          supplier: clamp(sanitize(d.supplier || ''), 120),
        })
        .select()
        .single();
      ensure(error);
      return mapBatch(data);
    },
    async update(id, patch) {
      const row = {};
      if (patch.batchNo !== undefined) row.batch_no = patch.batchNo;
      if (patch.expiryDate !== undefined) row.expiry_date = patch.expiryDate;
      if (patch.qty !== undefined) row.qty = Math.max(0, Math.floor(Number(patch.qty) || 0));
      if (patch.costPrice !== undefined) row.cost_price = patch.costPrice;
      if (patch.supplier !== undefined) row.supplier = patch.supplier;
      if (patch.status !== undefined) {
        if (!['active', 'quarantined', 'recalled'].includes(patch.status)) {
          throw new Error('Invalid batch status.');
        }
        row.status = patch.status;
      }
      const { data, error } = await supabase
        .from('product_batches')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      ensure(error);
      return mapBatch(data);
    },
    async remove(id) {
      const { error } = await supabase.from('product_batches').delete().eq('id', id);
      ensure(error);
      return id;
    },
  },

  sales: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      ensure(error);
      return data.map(mapSale);
    },
    async create(storeId, { items, paymentMethod, receiptNo, cashierEmail, trackStock, amountPaid, customerName, verifiedBy }) {
      const { data, error } = await supabase.rpc('create_sale', {
        p_store_id: storeId,
        p_items: items,
        p_payment_method: paymentMethod,
        p_receipt_no: receiptNo,
        p_cashier_email: cashierEmail || '',
        p_track_stock: Boolean(trackStock),
        p_amount_paid: amountPaid == null ? null : Number(amountPaid),
        p_customer_name: customerName ? clamp(sanitize(customerName), 100) : '',
        p_verified_by: verifiedBy ? clamp(sanitize(verifiedBy), 200) : '',
      });
      ensure(error);
      return mapSale(data);
    },
    async void(saleId, reason, byEmail, trackStock) {
      const { data, error } = await supabase.rpc('void_sale', {
        p_sale_id: saleId,
        p_reason: reason || 'No reason given',
        p_voided_by: byEmail || '',
        p_track_stock: Boolean(trackStock),
      });
      ensure(error);
      return mapSale(data);
    },
  },

  // Repayments against partial / credit sales. Writes go through security
  // definer RPCs so a cashier can record a payment without holding direct
  // write access to the sales table (see migration 007).
  creditPayments: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('credit_payments')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      ensure(error);
      return data.map(mapCreditPayment);
    },
    async add(storeId, { saleId, amount, method, note, receivedBy }) {
      const { data, error } = await supabase.rpc('record_credit_payment', {
        p_sale_id: saleId,
        p_amount: Number(amount),
        p_method: method || 'Cash',
        p_note: clamp(sanitize(note || ''), 500),
        p_received_by: clamp(sanitize(receivedBy || ''), 200),
      });
      ensure(error);
      return mapCreditPayment(data);
    },
    async remove(id) {
      const { error } = await supabase.rpc('delete_credit_payment', {
        p_payment_id: id,
      });
      ensure(error);
      return id;
    },
  },

  expenses: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('store_id', storeId)
        .order('date', { ascending: false });
      ensure(error);
      return data.map(mapExpense);
    },
    async create(storeId, d) {
      const cleanTitle = clamp(sanitize(d.title), 200);
      if (!cleanTitle) throw new Error('Expense title is required.');
      const amount = Number(d.amount);
      if (!amount || amount <= 0) throw new Error('Enter a valid expense amount.');
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          store_id: storeId,
          title: cleanTitle,
          amount,
          category: clamp(sanitize(d.category || 'Other'), 100),
          note: clamp(sanitize(d.note || ''), 500),
          date: d.date,
        })
        .select()
        .single();
      ensure(error);
      return mapExpense(data);
    },
    async remove(id) {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      ensure(error);
    },
  },

  voidLogs: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('void_logs')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      ensure(error);
      return data.map(mapVoidLog);
    },
  },

  // ------------------------------------------------------------------
  // Pharmacy Phase 2: suppliers, purchase receiving, prescriptions.
  // Purchases go through the record_purchase RPC so the purchase row and
  // every batch it brings in land in one transaction; prescriptions dispense
  // through the normal create_sale RPC (FEFO) and then record the event.
  // ------------------------------------------------------------------

  suppliers: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
      ensure(error);
      return data.map(mapSupplier);
    },
    async create(storeId, d) {
      const cleanName = clamp(sanitize(d.name), 120);
      if (!cleanName) throw new Error('Supplier name is required.');
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          store_id: storeId,
          name: cleanName,
          phone: clamp(sanitize(d.phone || ''), 40),
          email: clamp(sanitize(d.email || ''), 120),
          address: clamp(sanitize(d.address || ''), 200),
          notes: clamp(sanitize(d.notes || ''), 500),
        })
        .select()
        .single();
      ensure(error);
      return mapSupplier(data);
    },
    async update(id, patch) {
      const row = {};
      if (patch.name !== undefined) row.name = clamp(sanitize(patch.name), 120);
      if (patch.phone !== undefined) row.phone = clamp(sanitize(patch.phone || ''), 40);
      if (patch.email !== undefined) row.email = clamp(sanitize(patch.email || ''), 120);
      if (patch.address !== undefined) row.address = clamp(sanitize(patch.address || ''), 200);
      if (patch.notes !== undefined) row.notes = clamp(sanitize(patch.notes || ''), 500);
      const { data, error } = await supabase
        .from('suppliers')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      ensure(error);
      return mapSupplier(data);
    },
    async remove(id) {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      ensure(error);
      return id;
    },
  },

  purchases: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      ensure(error);
      return data.map(mapPurchase);
    },
    async create(storeId, { supplierId, reference, items, receivedBy }) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('A delivery needs at least one line.');
      }
      const { data, error } = await supabase.rpc('record_purchase', {
        p_store_id: storeId,
        p_supplier_id: supplierId || null,
        p_reference: clamp(sanitize(reference || ''), 60),
        p_items: items.map((line) => ({
          productId: line.productId,
          name: clamp(sanitize(line.name || ''), 200),
          qty: Math.max(0, Math.floor(Number(line.qty) || 0)),
          unitCost: Math.max(0, Number(line.unitCost) || 0),
          batchNo: clamp(sanitize(line.batchNo || ''), 60),
          expiryDate: line.expiryDate || null,
          supplier: clamp(sanitize(line.supplier || ''), 120),
        })),
        p_received_by: clamp(sanitize(receivedBy || ''), 200),
      });
      ensure(error);
      return mapPurchase(data);
    },
    async remove(id) {
      // Ledger row only - the physical batches it created are managed from
      // the batch drawer, not by deleting records.
      const { error } = await supabase.from('purchases').delete().eq('id', id);
      ensure(error);
      return id;
    },
  },

  prescriptions: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('prescriptions')
        .select('*, items:prescription_items(*)')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      ensure(error);
      return data.map((r) => mapPrescription(r, r.items || []));
    },

    async create(storeId, { patientName, patientPhone, patientAge, prescriber, notes, items, createdBy }) {
      const cleanPatient = clamp(sanitize(patientName), 120);
      if (!cleanPatient) throw new Error('Patient name is required.');
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Add at least one prescribed medicine.');
      }

      // Insert the script and its lines; items ride along in one round trip
      // so the page can show the full record immediately.
      const { data: rx, error: rxError } = await supabase
        .from('prescriptions')
        .insert({
          store_id: storeId,
          code: 'RX-' + Date.now().toString(36).toUpperCase().slice(-6),
          patient_name: cleanPatient,
          patient_phone: clamp(sanitize(patientPhone || ''), 40),
          patient_age: clamp(sanitize(patientAge || ''), 20),
          prescriber: clamp(sanitize(prescriber || ''), 120),
          notes: clamp(sanitize(notes || ''), 500),
          created_by: clamp(sanitize(createdBy || ''), 200),
        })
        .select()
        .single();
      ensure(rxError);

      const { data: itemRows, error: itemError } = await supabase
        .from('prescription_items')
        .insert(
          items.map((line) => ({
            prescription_id: rx.id,
            product_id: line.productId,
            product_name: clamp(sanitize(line.name || ''), 200),
            prescribed_qty: Math.max(1, Math.floor(Number(line.qty) || 1)),
            dispensed_qty: 0,
          }))
        )
        .select();
      ensure(itemError);
      return mapPrescription(rx, itemRows || []);
    },

    async cancel(id) {
      const { data, error } = await supabase
        .from('prescriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      ensure(error);
      return mapPrescription(data, []);
    },

    async remove(id) {
      const { error } = await supabase.from('prescriptions').delete().eq('id', id);
      ensure(error);
      return id;
    },

    /**
     * Dispense (part of) a prescription: a real sale through the FEFO
     * engine, then the line quantities advance and the dispensing event is
     * recorded with the receipt and its batch allocation.
     */
    async dispense(
      storeId,
      { prescriptionId, lines, paymentMethod, cashierEmail, verifiedBy }
    ) {
      if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error('Select at least one medicine to dispense.');
      }
      // Current state of the script, for validation and for the updates.
      const { data: rxRows, error: rxError } = await supabase
        .from('prescriptions')
        .select('*, items:prescription_items(*)')
        .eq('id', prescriptionId)
        .single();
      ensure(rxError);
      const rx = mapPrescription(rxRows, rxRows.items || []);
      if (rx.status !== 'open') {
        throw new Error('This prescription is not open for dispensing.');
      }

      for (const line of lines) {
        const item = rx.items.find((i) => i.productId === line.productId);
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

      // Prices come from the catalogue at dispense time.
      const { data: productRows, error: productError } = await supabase
        .from('products')
        .select('id, name, sale_price, is_rx, is_controlled')
        .in('id', lines.map((l) => l.productId));
      ensure(productError);

      const saleItems = lines.map((line) => {
        const p = productRows.find((row) => row.id === line.productId);
        if (!p) throw new Error('Product not found');
        const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
        return {
          productId: p.id,
          name: p.name,
          qty,
          price: Number(p.sale_price || 0),
          lineTotal: Number(p.sale_price || 0) * qty,
          ...(p.is_rx ? { isRx: true } : {}),
          ...(p.is_controlled ? { isControlled: true } : {}),
        };
      });

      const method = ['Cash', 'Transfer', 'POS/Card'].includes(paymentMethod)
        ? paymentMethod
        : 'Cash';
      const sale = await supabaseAdapter.sales.create(storeId, {
        items: saleItems,
        paymentMethod: method,
        receiptNo: 'SM-' + Date.now().toString().slice(-8),
        cashierEmail: cashierEmail || '',
        trackStock: true,
        verifiedBy: verifiedBy || '',
      });

      // Advance the line quantities (the sale is already committed; these
      // record-keeping writes follow it).
      for (const line of lines) {
        const item = rx.items.find((i) => i.productId === line.productId);
        const { error: itemError } = await supabase
          .from('prescription_items')
          .update({
            dispensed_qty: item.dispensedQty + Math.max(1, Math.floor(Number(line.qty) || 1)),
          })
          .eq('id', item.id);
        ensure(itemError);
      }

      const fullyDispensed = rx.items.every((item) => {
        const line = lines.find((l) => l.productId === item.productId);
        const advanced = line
          ? item.dispensedQty + Math.max(1, Math.floor(Number(line.qty) || 1))
          : item.dispensedQty;
        return advanced >= item.prescribedQty;
      });

      const { data: updatedRx, error: updatedRxError } = await supabase
        .from('prescriptions')
        .update({
          status: fullyDispensed ? 'dispensed' : 'open',
          updated_at: new Date().toISOString(),
        })
        .eq('id', prescriptionId)
        .select('*, items:prescription_items(*)')
        .single();
      ensure(updatedRxError);

      const { error: dispensingError } = await supabase
        .from('prescription_dispensings')
        .insert({
          store_id: storeId,
          prescription_id: prescriptionId,
          sale_id: sale.id,
          receipt_no: sale.receiptNo,
          items: sale.items,
          dispensed_by: clamp(sanitize(cashierEmail || ''), 200),
        });
      ensure(dispensingError);

      return { sale, prescription: mapPrescription(updatedRx, updatedRx.items || []) };
    },

    dispensings: {
      async list(storeId) {
        const { data, error } = await supabase
          .from('prescription_dispensings')
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false });
        ensure(error);
        return data.map(mapDispensing);
      },
    },
  },

  team: {
    async list(storeId) {
      const { data, error } = await supabase
        .from('store_members')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at');
      ensure(error);
      return data.map(mapMember);
    },
    async updateRole(memberId, role) {
      const allowed = ['cashier', 'manager', 'admin'];
      if (!allowed.includes(role)) throw new Error('Invalid role.');
      const { data, error } = await supabase
        .from('store_members')
        .update({ role })
        .eq('id', memberId)
        .select()
        .single();
      ensure(error);
      return mapMember(data);
    },
    // Phase 3: licensed-pharmacist flag, independent of role. Same trust line
    // as role changes - the "owner updates team" RLS policy governs.
    async setPharmacist(memberId, isPharmacist) {
      const { data, error } = await supabase
        .from('store_members')
        .update({ is_pharmacist: Boolean(isPharmacist) })
        .eq('id', memberId)
        .select()
        .single();
      ensure(error);
      return mapMember(data);
    },
    async updateApproval(memberId, status) {
      const { data, error } = await supabase.rpc('set_member_approval', {
        p_member_id: memberId,
        p_status: status,
      });
      ensure(error);
      return mapMember(data);
    },
    async remove(memberId) {
      const { error } = await supabase
        .from('store_members')
        .delete()
        .eq('id', memberId);
      ensure(error);
    },
  },

  admin: {
    async getDashboard() {
      const { data, error } = await supabase.rpc('admin_dashboard');
      ensure(error);
      return {
        stats: data?.stats || {},
        users: data?.users || [],
        stores: data?.stores || [],
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
      const { data, error } = await supabase.rpc('set_member_approval', {
        p_member_id: memberId,
        p_status: status,
      });
      ensure(error);
      return mapMember(data);
    },
    async approveUser(memberId) {
      return this.updateApproval(memberId, 'approved');
    },
    async rejectUser(memberId) {
      return this.updateApproval(memberId, 'rejected');
    },
    async deleteUser(userId) {
      // Removing only the membership row left the actual Supabase Auth
      // account (email, password, sessions) fully intact, so a "deleted"
      // user could still sign back in at any time -- not what "Delete
      // {email}? This cannot be undone" promises. The RPC removes the
      // membership *and* the auth.users row (Supabase cascades identities,
      // sessions and refresh tokens off of it), so the account is really
      // gone and the email is immediately free for a new signup.
      const { error } = await supabase.rpc('admin_delete_user_account', {
        p_user_id: userId,
      });
      ensure(error);
      return { userId };
    },
    async deleteStore(storeId) {
      const { error } = await supabase.from('stores').delete().eq('id', storeId);
      ensure(error);
      return storeId;
    },
    async upgradeStoreToOwner(storeId) {
      // Prefer the dedicated super-admin RPC; fall back to a direct update
      // when the RPC is not yet deployed (e.g. older environments).
      const { data, error } = await supabase.rpc('admin_upgrade_store_to_owner', {
        p_store_id: storeId,
      });
      if (error) {
        // If the RPC does not exist or fails with 404, try a direct update.
        // The RLS policy "super admin update stores" allows this.
        if (error.code === 'PGRST202' || /not found|does not exist/i.test(error.message)) {
          const { data: fallback, error: fallbackError } = await supabase
            .from('stores')
            .update({ plan: 'owner' })
            .eq('id', storeId)
            .select()
            .single();
          ensure(fallbackError);
          return mapStore(fallback);
        }
        ensure(error);
      }
      // RPC returns a stores row directly
      return data ? mapStore(data) : storeId;
    },
  },
};
