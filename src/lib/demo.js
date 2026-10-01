// src/lib/demo.js
// Seeds a fully populated demo store (local backend only).
import { api } from './backend';
import { localAdapter } from './backend/local';

const DEMO_EMAIL = 'demo@smartstoreng.com';
const DEMO_PASSWORD = 'Demo1234!';
// Separate account for the pharmacy demo: a user belongs to one store, and
// this one should land in a Pharmacy Mode store, not Demo Supermart.
export const PHARMACY_DEMO_EMAIL = 'pharmacy.demo@smartstoreng.com';

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

export async function loginOrCreateDemo({ localOnly = false } = {}) {
  const target = localOnly ? localAdapter : api;
  let user;
  try {
    user = await target.auth.signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  } catch {
    user = await target.auth.signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  }

  let membership = await target.stores.getMyMembership(user.id);
  if (!membership) {
    const store = await target.stores.create(user.id, user.email, {
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
    // The demo store behaves as a YEARLY Owner Mode subscriber, so anyone
    // trying it can experience both the monitoring app and the full
    // transactional app.
    await target.stores.update(store.id, {
      isDemo: true,
      plan: 'owner',
      billingCycle: 'yearly',
    });

    const created = [];
    for (const p of DEMO_PRODUCTS) {
      created.push(await target.products.create(store.id, p));
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
      const sale = await target.sales.create(store.id, {
        items,
        paymentMethod: s.method,
        receiptNo: 'SM-' + String(now - s.daysAgo * day).slice(-8),
        cashierEmail: DEMO_EMAIL,
        trackStock: true,
      });
      // backdate (local adapter only; direct localStorage tweak)
      backdate('smartstore-db', 'sales', sale.id, new Date(now - s.daysAgo * day));
    }

    // A couple of credit sales so the Credit Book has live records to show:
    // one partial payment with a repayment already collected, one full credit.
    const creditSale = async (daysAgo, picks, method, customerName, amountPaid) => {
      const counts = {};
      picks.forEach((i) => (counts[i] = (counts[i] || 0) + 1));
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
      const total = items.reduce((sum, i) => sum + i.lineTotal, 0);
      const sale = await target.sales.create(store.id, {
        items,
        paymentMethod: method,
        receiptNo: 'SM-' + String(now - daysAgo * day).slice(-8),
        cashierEmail: DEMO_EMAIL,
        trackStock: true,
        amountPaid: method === 'Credit' ? 0 : amountPaid,
        customerName,
      });
      backdate('smartstore-db', 'sales', sale.id, new Date(now - daysAgo * day));
      return { sale, total };
    };

    // Mama Ngozi took ₦15,800 of goods, paid ₦10,000 and has already brought
    // ₦5,000 back; the Credit Book shows her with ₦800 left to pay.
    const partial = await creditSale(3, [0, 0, 5, 7, 7], 'Partial', 'Mama Ngozi', 10000);
    const repayment = await target.creditPayments.add(store.id, {
      saleId: partial.sale.id,
      amount: 5000,
      method: 'Cash',
      note: 'Brought part of the balance',
      receivedBy: DEMO_EMAIL,
    });
    backdate('smartstore-db', 'creditPayments', repayment.id, new Date(now - 1 * day));

    // Chidi Okeke took goods on full credit yesterday and hasn't paid yet.
    await creditSale(1, [3, 4], 'Credit', 'Chidi Okeke');

    const expenses = [
      { title: 'Generator fuel', amount: 15000, category: 'Utilities', daysAgo: 1 },
      { title: 'Shop rent (monthly)', amount: 120000, category: 'Rent', daysAgo: 10 },
      { title: 'New shelving', amount: 45000, category: 'Equipment', daysAgo: 20 },
      { title: 'NEPA bill', amount: 22000, category: 'Utilities', daysAgo: 35 },
    ];
    for (const e of expenses) {
      await target.expenses.create(store.id, {
        title: e.title,
        amount: e.amount,
        category: e.category,
        note: '',
        date: new Date(now - e.daysAgo * day).toISOString().slice(0, 10),
      });
    }

    await target.stores.update(store.id, {
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

// ---------------------------------------------------------------------------
// Pharmacy Mode demo: a stocked community pharmacy with real batch depth -
// FEFO stock, a near-expiry antimalarial, an expired paracetamol batch the
// expiry watch flags, a quarantined inhaler batch and Rx medicines.
// ---------------------------------------------------------------------------

const isoIn = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const PHARMACY_PRODUCTS = [
  {
    name: 'Amoxil 500mg Caps (pack of 100)',
    sku: 'AMX-500',
    category: 'Prescription Drugs',
    genericName: 'Amoxicillin',
    strength: '500 mg',
    dosageForm: 'Capsule',
    packSize: 'pack of 100',
    isRx: true,
    costPrice: 3200,
    salePrice: 4500,
    openingBatch: { qty: 40, batchNo: 'AMX-2419', expiryDate: isoIn(40), supplier: 'Emzor' },
    extraBatches: [{ qty: 60, batchNo: 'AMX-2501', expiryDate: isoIn(300), supplier: 'Emzor' }],
  },
  {
    name: 'Paracetamol 500mg Tab (pack of 1000)',
    sku: 'PCM-500',
    category: 'Over-the-Counter',
    genericName: 'Paracetamol',
    strength: '500 mg',
    dosageForm: 'Tablet',
    packSize: 'pack of 1000',
    costPrice: 4000,
    salePrice: 5500,
    // An expired batch on the shelf - exactly what the expiry watch is for.
    openingBatch: { qty: 150, batchNo: 'PCM-118', expiryDate: isoIn(-12), supplier: 'Juhel' },
    extraBatches: [{ qty: 300, batchNo: 'PCM-126', expiryDate: isoIn(85), supplier: 'Juhel' }],
  },
  {
    name: 'Artemether-Lumefantrine 20/120 (pack of 6)',
    sku: 'AL-20120',
    category: 'Prescription Drugs',
    genericName: 'Artemether + Lumefantrine',
    strength: '20/120 mg',
    dosageForm: 'Tablet',
    packSize: 'pack of 6',
    isRx: true,
    costPrice: 900,
    salePrice: 1400,
    openingBatch: { qty: 120, batchNo: 'AL-77', expiryDate: isoIn(24), supplier: 'Swipha' },
    extraBatches: [{ qty: 180, batchNo: 'AL-82', expiryDate: isoIn(210), supplier: 'Swipha' }],
  },
  {
    name: 'Amoxiclav 625mg Tab (pack of 14)',
    sku: 'AMC-625',
    category: 'Prescription Drugs',
    genericName: 'Amoxicillin + Clavulanic acid',
    strength: '625 mg',
    dosageForm: 'Tablet',
    packSize: 'pack of 14',
    isRx: true,
    costPrice: 5200,
    salePrice: 7100,
    openingBatch: { qty: 45, batchNo: 'AMC-55', expiryDate: isoIn(60), supplier: 'GSK' },
    extraBatches: [],
  },
  {
    name: 'Ibuprofen 400mg Tab (pack of 100)',
    sku: 'IBU-400',
    category: 'Over-the-Counter',
    genericName: 'Ibuprofen',
    strength: '400 mg',
    dosageForm: 'Tablet',
    packSize: 'pack of 100',
    costPrice: 1800,
    salePrice: 2600,
    openingBatch: { qty: 200, batchNo: 'IBU-31', expiryDate: isoIn(150), supplier: 'Emzor' },
    extraBatches: [],
  },
  {
    name: 'Metformin 500mg Tab (pack of 100)',
    sku: 'MET-500',
    category: 'Prescription Drugs',
    genericName: 'Metformin',
    strength: '500 mg',
    dosageForm: 'Tablet',
    packSize: 'pack of 100',
    isRx: true,
    costPrice: 2600,
    salePrice: 3800,
    openingBatch: { qty: 80, batchNo: 'MET-19', expiryDate: isoIn(400), supplier: 'Tolero' },
    extraBatches: [],
  },
  {
    name: 'Amlodipine 10mg Tab (pack of 30)',
    sku: 'AML-10',
    category: 'Prescription Drugs',
    genericName: 'Amlodipine',
    strength: '10 mg',
    dosageForm: 'Tablet',
    packSize: 'pack of 30',
    isRx: true,
    costPrice: 1400,
    salePrice: 2100,
    openingBatch: { qty: 60, batchNo: 'AML-07', expiryDate: isoIn(350), supplier: 'Emzor' },
    extraBatches: [],
  },
  {
    name: 'Vitamin C 100mg Tab (pack of 100)',
    sku: 'VC-100',
    category: 'Vitamins & Supplements',
    genericName: 'Ascorbic acid',
    strength: '100 mg',
    dosageForm: 'Tablet',
    packSize: 'pack of 100',
    costPrice: 1200,
    salePrice: 1800,
    openingBatch: { qty: 150, batchNo: 'VC-44', expiryDate: isoIn(70), supplier: 'Juhel' },
    extraBatches: [],
  },
  {
    name: 'Piriton Syrup 100ml',
    sku: 'PIR-100',
    category: 'Over-the-Counter',
    genericName: 'Chlorpheniramine',
    strength: '2 mg/5 ml',
    dosageForm: 'Syrup',
    packSize: 'bottle',
    costPrice: 1100,
    salePrice: 1600,
    openingBatch: { qty: 35, batchNo: 'PIR-12', expiryDate: isoIn(90), supplier: 'GSK' },
    extraBatches: [],
  },
  {
    name: 'ORS Sachets (pack of 10)',
    sku: 'ORS-10',
    category: 'Over-the-Counter',
    genericName: 'Oral rehydration salts',
    dosageForm: 'Sachet',
    packSize: 'pack of 10',
    costPrice: 500,
    salePrice: 800,
    openingBatch: { qty: 100, batchNo: 'ORS-08', expiryDate: isoIn(500), supplier: 'ROC' },
    extraBatches: [],
  },
  {
    name: 'Malaria Test Kit (RCT)',
    sku: 'RCT-01',
    category: 'Medical Devices',
    genericName: 'Rapid diagnostic test',
    dosageForm: 'Other',
    packSize: 'single test',
    costPrice: 600,
    salePrice: 1000,
    openingBatch: { qty: 50, batchNo: 'RCT-21', expiryDate: isoIn(120), supplier: 'SD Bioline' },
    extraBatches: [],
  },
  {
    name: 'Salbutamol Inhaler 100mcg',
    sku: 'SAL-100',
    category: 'Prescription Drugs',
    genericName: 'Salbutamol',
    strength: '100 mcg',
    dosageForm: 'Inhaler',
    packSize: '200 doses',
    isRx: true,
    costPrice: 3800,
    salePrice: 5200,
    openingBatch: { qty: 20, batchNo: 'SAL-03', expiryDate: isoIn(250), supplier: 'GSK' },
    // One damaged delivery sits quarantined - visible, never dispensed.
    extraBatches: [{ qty: 8, batchNo: 'SAL-01', expiryDate: isoIn(250), supplier: 'GSK', quarantine: true }],
  },
  {
    // Phase 3: a controlled medicine. Every dispensing is written to the
    // Controlled Register with its batch, patient and verifying pharmacist.
    name: 'Tramadol 50mg Cap (pack of 10)',
    sku: 'TRA-50',
    category: 'Prescription Drugs',
    genericName: 'Tramadol',
    strength: '50 mg',
    dosageForm: 'Capsule',
    packSize: 'pack of 10',
    isRx: true,
    isControlled: true,
    costPrice: 1200,
    salePrice: 1800,
    openingBatch: { qty: 25, batchNo: 'TRA-11', expiryDate: isoIn(330), supplier: 'Emzor' },
    extraBatches: [],
  },
];

export async function loginOrCreatePharmacyDemo({ localOnly = false } = {}) {
  const target = localOnly ? localAdapter : api;
  let user;
  try {
    user = await target.auth.signIn({
      email: PHARMACY_DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
  } catch {
    user = await target.auth.signUp({
      email: PHARMACY_DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
  }

  let membership = await target.stores.getMyMembership(user.id);
  if (!membership) {
    const store = await target.stores.create(user.id, user.email, {
      name: 'Healthway Pharmacy',
      type: 'pharmacy',
      categories: [
        'Prescription Drugs',
        'Over-the-Counter',
        'Vitamins & Supplements',
        'First Aid',
        'Personal Care',
        'Baby & Mother',
        'Medical Devices',
      ],
    });
    await target.stores.update(store.id, {
      isDemo: true,
      plan: 'owner',
      billingCycle: 'yearly',
    });

    // Phase 3: the demo owner is the pharmacy's licensed pharmacist, so the
    // till offers them as the verifying pharmacist for controlled medicines.
    const ownerMember = (await target.team.list(store.id)).find(
      (m) => m.role === 'owner'
    );
    if (ownerMember) {
      await target.team.setPharmacist(ownerMember.id, true);
    }

    const created = [];
    for (const p of PHARMACY_PRODUCTS) {
      const product = await target.products.create(store.id, p);
      for (const extra of p.extraBatches || []) {
        const batch = await target.batches.add(store.id, {
          productId: product.id,
          qty: extra.qty,
          batchNo: extra.batchNo,
          expiryDate: extra.expiryDate,
          costPrice: p.costPrice,
          supplier: extra.supplier,
        });
        if (extra.quarantine) {
          await target.batches.update(batch.id, { status: 'quarantined' });
        }
      }
      created.push(product);
    }

    // Dispensing history across the last weeks. Sales allocate FEFO, so the
    // near-expiry batches above drain first - the demo shows real rotation.
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const sampleSales = [
      { daysAgo: 0, picks: [2, 2, 10], method: 'Cash' },
      { daysAgo: 0, picks: [4, 7], method: 'Transfer' },
      { daysAgo: 1, picks: [1, 8], method: 'POS/Card' },
      { daysAgo: 2, picks: [5, 5, 9], method: 'Cash' },
      { daysAgo: 3, picks: [2, 11], method: 'Transfer' },
      { daysAgo: 5, picks: [0, 0, 6], method: 'Cash' },
      { daysAgo: 8, picks: [3, 8, 10], method: 'POS/Card' },
      { daysAgo: 13, picks: [2, 2, 4], method: 'Cash' },
      { daysAgo: 21, picks: [6, 9], method: 'Transfer' },
      { daysAgo: 34, picks: [0, 3], method: 'Cash' },
      { daysAgo: 48, picks: [2, 2, 2, 7], method: 'Cash' },
      // Phase 3: a walk-in controlled dispensing, verified by the
      // pharmacist - the Controlled Register's bread and butter.
      { daysAgo: 6, picks: [12, 8], method: 'Cash', verifiedBy: PHARMACY_DEMO_EMAIL },
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
          ...(p.isRx ? { isRx: true } : {}),
          ...(p.isControlled ? { isControlled: true } : {}),
        };
      });
      const sale = await target.sales.create(store.id, {
        items,
        paymentMethod: s.method,
        receiptNo: 'SM-' + String(now - s.daysAgo * day).slice(-8),
        cashierEmail: PHARMACY_DEMO_EMAIL,
        trackStock: true,
        ...(s.verifiedBy ? { verifiedBy: s.verifiedBy } : {}),
      });
      backdate('smartstore-db', 'sales', sale.id, new Date(now - s.daysAgo * day));
    }

    // A part-paid dispensing so the Credit Book has a live record too.
    const picks = [2, 2, 9];
    const counts = {};
    picks.forEach((i) => (counts[i] = (counts[i] || 0) + 1));
    const creditItems = Object.entries(counts).map(([i, qty]) => {
      const p = created[Number(i)];
      return {
        productId: p.id,
        name: p.name,
        qty,
        price: p.salePrice,
        lineTotal: p.salePrice * qty,
      };
    });
    const creditSale = await target.sales.create(store.id, {
      items: creditItems,
      paymentMethod: 'Partial',
      receiptNo: 'SM-' + String(now - 2 * day).slice(-8),
      cashierEmail: PHARMACY_DEMO_EMAIL,
      trackStock: true,
      amountPaid: 2000,
      customerName: 'Mrs. Adeyemi',
    });
    backdate('smartstore-db', 'sales', creditSale.id, new Date(now - 2 * day));

    // Phase 2: the supply chain behind those batches. Suppliers first, then
    // two recorded deliveries - receiving stock now happens through the
    // Purchases page, exactly like this.
    const supplierIds = {};
    for (const s of [
      { name: 'Emzor Pharmaceuticals', phone: '0803-000-1122', notes: 'Delivers Tuesdays' },
      { name: 'Juhel Nigeria Ltd', phone: '0805-000-3344', notes: '14-day credit terms' },
      { name: 'Swipha (Swiss Pharma)', phone: '0706-000-5566', notes: '' },
    ]) {
      const supplier = await target.suppliers.create(store.id, s);
      supplierIds[s.name] = supplier.id;
    }

    const restocks = [
      {
        supplierId: supplierIds['Emzor Pharmaceuticals'],
        reference: 'EMZ-INV-4471',
        daysAgo: 4,
        lines: [
          {
            product: created[0], // Amoxil 500mg
            qty: 30,
            batchNo: 'AMX-2530',
            expiryDays: 540,
          },
          {
            product: created[11], // Salbutamol inhaler
            qty: 10,
            batchNo: 'SAL-04',
            expiryDays: 420,
          },
        ],
      },
      {
        supplierId: supplierIds['Juhel Nigeria Ltd'],
        reference: 'JHL-WB-0902',
        daysAgo: 11,
        lines: [
          {
            product: created[7], // Vitamin C
            qty: 40,
            batchNo: 'VC-51',
            expiryDays: 300,
          },
        ],
      },
    ];
    for (const r of restocks) {
      const supplierName =
        Object.entries(supplierIds).find(([, id]) => id === r.supplierId)?.[0] || '';
      const purchase = await target.purchases.create(store.id, {
        supplierId: r.supplierId,
        reference: r.reference,
        items: r.lines.map((line) => ({
          productId: line.product.id,
          name: line.product.name,
          qty: line.qty,
          unitCost: line.product.costPrice,
          batchNo: line.batchNo,
          expiryDate: isoIn(line.expiryDays),
          supplier: supplierName,
        })),
        receivedBy: PHARMACY_DEMO_EMAIL,
      });
      backdate('smartstore-db', 'purchases', purchase.id, new Date(now - r.daysAgo * day));
    }

    // A live prescription with part-dispensing: the patient collected part of
    // the course already, the balance is still open on the book.
    const rx = await target.prescriptions.create(store.id, {
      patientName: 'Mr. Musa Ibrahim',
      patientPhone: '0802-311-4455',
      patientAge: '58',
      prescriber: 'Dr. Eze, Lagoon Clinic',
      notes: 'Collect balance after 7 days.',
      items: [
        { productId: created[2].id, name: created[2].name, qty: 2 },
        { productId: created[8].id, name: created[8].name, qty: 1 },
        { productId: created[9].id, name: created[9].name, qty: 4 },
      ],
      createdBy: PHARMACY_DEMO_EMAIL,
    });
    await target.prescriptions.dispense(store.id, {
      prescriptionId: rx.id,
      lines: [{ productId: created[2].id, qty: 2 }],
      paymentMethod: 'Cash',
      cashierEmail: PHARMACY_DEMO_EMAIL,
    });

    // Phase 3: a fully dispensed controlled script with a named verifier -
    // the Controlled Register opens with real, patient-linked history.
    const cdRx = await target.prescriptions.create(store.id, {
      patientName: 'Mrs. Iyabo Ogun',
      patientPhone: '0809-442-1187',
      patientAge: '47',
      prescriber: 'Dr. Bello, Unity Hospital',
      notes: '',
      items: [{ productId: created[12].id, name: created[12].name, qty: 2 }],
      createdBy: PHARMACY_DEMO_EMAIL,
    });
    await target.prescriptions.dispense(store.id, {
      prescriptionId: cdRx.id,
      lines: [{ productId: created[12].id, qty: 2 }],
      paymentMethod: 'Cash',
      cashierEmail: PHARMACY_DEMO_EMAIL,
      verifiedBy: PHARMACY_DEMO_EMAIL,
    });


    const expenses = [
      { title: 'Generator fuel', amount: 15000, category: 'Utilities', daysAgo: 1 },
      { title: 'Shop rent (monthly)', amount: 180000, category: 'Rent', daysAgo: 9 },
      { title: 'PCN annual licence', amount: 25000, category: 'Licences & Regulatory', daysAgo: 18 },
      { title: 'Air conditioning service', amount: 20000, category: 'Maintenance', daysAgo: 30 },
    ];
    for (const e of expenses) {
      await target.expenses.create(store.id, {
        title: e.title,
        amount: e.amount,
        category: e.category,
        note: '',
        date: new Date(now - e.daysAgo * day).toISOString().slice(0, 10),
      });
    }

    await target.stores.update(store.id, {
      onboarding: { firstProductAdded: true, firstSaleCompleted: true },
    });
  }

  return user;
}
