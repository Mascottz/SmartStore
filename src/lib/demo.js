// src/lib/demo.js
// Seeds a fully populated demo store (local backend only).
import { api } from './backend';

const DEMO_EMAIL = 'demo@smartstoreng.com';
const DEMO_PASSWORD = 'Demo1234!';

const DEMO_PRODUCTS = [
  { name: 'Peak Milk 400g', sku: 'PK-400', category: 'Beverages', costPrice: 2200, salePrice: 2800, stock: 120 },
  { name: 'Indomie Chicken 70g', sku: 'IND-70', category: 'Food Cupboard & Dry Foods', costPrice: 250, salePrice: 350, stock: 480 },
  { name: 'Coca-Cola 50cl', sku: 'CC-50', category: 'Beverages', costPrice: 250, salePrice: 400, stock: 200 },
  { name: 'Golden Penny Semovita 1kg', sku: 'GP-SEM1', category: 'Food Cupboard & Dry Foods', costPrice: 1400, salePrice: 1750, stock: 65 },
  { name: 'Dettol Soap 110g', sku: 'DT-110', category: 'Toiletries & Personal Care', costPrice: 450, salePrice: 650, stock: 90 },
  { name: 'Ariel Detergent 900g', sku: 'AR-900', category: 'Household & Cleaning', costPrice: 1900, salePrice: 2400, stock: 40 },
  { name: 'Gala Sausage Roll', sku: 'GL-01', category: 'Snacks & Confectionery', costPrice: 250, salePrice: 350, stock: 30 },
  { name: 'Pampers Baby Dry (small)', sku: 'PMP-S', category: 'Baby & Kids', costPrice: 3200, salePrice: 3900, stock: 18 },
  { name: 'Titus Sardine', sku: 'TS-01', category: 'Food Cupboard & Dry Foods', costPrice: 950, salePrice: 1250, stock: 75 },
  { name: 'Eva Water 75cl', sku: 'EV-75', category: 'Beverages', costPrice: 150, salePrice: 250, stock: 300 },
];

export async function loginOrCreateDemo() {
  let user;
  try {
    user = await api.auth.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  } catch {
    user = await api.auth.signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  }

  let membership = await api.stores.getMyMembership(user.id);
  if (!membership) {
    const store = await api.stores.create(user.id, user.email, {
      name: 'Demo Supermart',
      type: 'supermarket',
      categories: [
        'Beverages',
        'Snacks & Confectionery',
        'Food Cupboard & Dry Foods',
        'Toiletries & Personal Care',
        'Household & Cleaning',
        'Baby & Kids',
      ],
    });
    await api.stores.update(store.id, { isDemo: true, plan: 'owner' });

    const created = [];
    for (const p of DEMO_PRODUCTS) {
      created.push(await api.products.create(store.id, p));
    }

    // A few historical sales so dashboards & reports have data
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const sampleSales = [
      { daysAgo: 0, picks: [0, 2, 9], method: 'Cash' },
      { daysAgo: 0, picks: [1, 1, 6], method: 'Transfer' },
      { daysAgo: 1, picks: [3, 4], method: 'POS/Card' },
      { daysAgo: 2, picks: [5, 8, 2], method: 'Cash' },
      { daysAgo: 4, picks: [7], method: 'Transfer' },
      { daysAgo: 6, picks: [0, 1, 2, 9], method: 'Cash' },
      { daysAgo: 12, picks: [8, 3], method: 'POS/Card' },
      { daysAgo: 34, picks: [0, 5], method: 'Cash' },
      { daysAgo: 41, picks: [2, 2, 6, 9], method: 'Cash' },
      { daysAgo: 66, picks: [4, 1], method: 'Transfer' },
    ];

    for (const s of sampleSales) {
      const counts = {};
      s.picks.forEach((i) => (counts[i] = (counts[i] || 0) + 1));
      const items = Object.entries(counts).map(([i, qty]) => {
        const p = created[Number(i)];
        return {
          productId: p.id,
          name: p.name,
          qty,
          price: p.salePrice,
          lineTotal: p.salePrice * qty,
        };
      });
      const sale = await api.sales.create(store.id, {
        items,
        paymentMethod: s.method,
        receiptNo: 'SM-' + String(now - s.daysAgo * day).slice(-8),
        cashierEmail: DEMO_EMAIL,
        trackStock: true,
      });
      // backdate (local adapter only – direct localStorage tweak)
      backdate('smartstore-db', 'sales', sale.id, new Date(now - s.daysAgo * day));
    }

    const expenses = [
      { title: 'Generator fuel', amount: 15000, category: 'Utilities', daysAgo: 1 },
      { title: 'Shop rent (monthly)', amount: 120000, category: 'Rent', daysAgo: 10 },
      { title: 'New shelving', amount: 45000, category: 'Equipment', daysAgo: 20 },
      { title: 'NEPA bill', amount: 22000, category: 'Utilities', daysAgo: 35 },
    ];
    for (const e of expenses) {
      await api.expenses.create(store.id, {
        title: e.title,
        amount: e.amount,
        category: e.category,
        note: '',
        date: new Date(now - e.daysAgo * day).toISOString().slice(0, 10),
      });
    }

    await api.stores.update(store.id, {
      onboarding: { firstProductAdded: true, firstSaleCompleted: true },
    });
  }

  return user;
}

function backdate(dbKey, collection, id, date) {
  try {
    const db = JSON.parse(localStorage.getItem(dbKey));
    const row = db[collection].find((r) => r.id === id);
    if (row) {
      row.createdAt = date.toISOString();
      localStorage.setItem(dbKey, JSON.stringify(db));
    }
  } catch (e) {
    console.error('backdate failed', e);
  }
}
