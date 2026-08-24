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
    createdAt: p.created_at,
  };

const mapSale = (s) =>
  s && {
    id: s.id,
    storeId: s.store_id,
    receiptNo: s.receipt_no,
    paymentMethod: s.payment_method,
    cashierEmail: s.cashier_email || '',
    status: s.status,
    items: s.items || [],
    total: Number(s.total || 0),
    createdAt: s.created_at,
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
    approvalStatus: m.approval_status || 'approved',
    createdAt: m.created_at,
  };

function ensure(error) {
  if (error) throw new Error(error.message);
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
    async getUser() {
      const { data } = await supabase.auth.getSession();
      const u = data?.session?.user;
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
    async create(storeId, { items, paymentMethod, receiptNo, cashierEmail, trackStock }) {
      const { data, error } = await supabase.rpc('create_sale', {
        p_store_id: storeId,
        p_items: items,
        p_payment_method: paymentMethod,
        p_receipt_no: receiptNo,
        p_cashier_email: cashierEmail || '',
        p_track_stock: Boolean(trackStock),
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
      const { error } = await supabase
        .from('store_members')
        .delete()
        .eq('user_id', userId);
      ensure(error);
      return { userId };
    },
    async deleteStore(storeId) {
      const { error } = await supabase.from('stores').delete().eq('id', storeId);
      ensure(error);
      return storeId;
    },
  },
};
