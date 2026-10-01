// StoreSense orchestration. The browser builds a live, role-filtered
// operational snapshot for the optional server endpoint. Catalogue and other
// business labels are included so it can answer store-specific questions;
// customer/patient names, staff emails and raw receipts never leave the app.
import { api } from './backend';
import { hasOwnerModePlan } from './ownerExperience';

const DEFAULT_ENDPOINT = '/api/assistant';

/**
 * StoreSense is an Owner Mode feature.
 *
 * The gate is the store's plan, not the staff role: once a store subscribes,
 * every approved member of that store (owner, admin, manager, cashier) can
 * ask the assistant, and each person's existing permissions still apply.
 * Shop Mode (free) stores get the upgrade prompt instead. Demo stores behave
 * as yearly subscribers, so the public demo keeps the assistant.
 *
 * The same rule is enforced server-side in api/assistant.js, so the paid
 * endpoint cannot be reached by a free store calling it directly.
 *
 * @param {{ plan?: string, storeIsDemo?: boolean }} store
 * @returns {boolean}
 */
export function canUseAssistant({ plan, storeIsDemo } = {}) {
  return hasOwnerModePlan({ plan, storeIsDemo });
}

const money = (value) =>
  `₦${Number(value || 0).toLocaleString('en-NG', {
    maximumFractionDigits: 0,
  })}`;

const plural = (count, singular, many = `${singular}s`) =>
  `${count} ${count === 1 ? singular : many}`;

const normalise = (value) => String(value || '').trim().toLowerCase();

/**
 * Build the identity-free operational snapshot used by both the optional AI
 * endpoint and the local fallback, so demo and live stores answer from the
 * same current facts. The endpoint applies its own size and privacy boundary.
 */
export function buildAssistantContext({
  storeName,
  niche,
  role,
  plan,
  billingCycle,
  storeIsDemo = false,
  currentPath = '/',
  sales = [],
  products = [],
  categories = [],
  expenses = [],
  creditPayments = [],
  voidLogs = [],
  team = [],
  batches = [],
  suppliers = [],
  purchases = [],
  prescriptions = [],
  dispensings = [],
}) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const number = (value) => Number(value) || 0;
  const inWindow = (date, start) => Boolean(date) && new Date(date) >= start;
  const sum = (items, field = 'total') =>
    items.reduce((total, item) => total + number(item?.[field]), 0);
  const managementAccess = ['owner', 'admin', 'manager'].includes(role);
  const teamAccess = ['owner', 'admin'].includes(role);

  const completedSales = sales.filter((sale) => sale.status === 'completed');
  const voidedSales = sales.filter((sale) => sale.status === 'voided');
  const todaySales = completedSales.filter((sale) => inWindow(sale.createdAt, today));
  const weekSales = completedSales.filter((sale) => inWindow(sale.createdAt, sevenDaysAgo));
  const monthSales = completedSales.filter((sale) => inWindow(sale.createdAt, monthStart));
  const saleUnits = (items) =>
    items.reduce(
      (total, sale) =>
        total + (sale.items || []).reduce((lineTotal, item) => lineTotal + number(item.qty), 0),
      0
    );

  const paymentMix = {};
  monthSales.forEach((sale) => {
    const method = sale.paymentMethod || 'Other';
    const row = paymentMix[method] || { method, sales: 0, revenue: 0 };
    row.sales += 1;
    row.revenue += number(sale.total);
    paymentMix[method] = row;
  });

  // Product performance is aggregated across receipts before it reaches the
  // assistant. StoreSense can answer about any catalogue item without ever
  // receiving customer names, receipt numbers or individual transactions.
  const productPerformance = new Map();
  const addPerformance = (sale, period) => {
    (sale.items || []).forEach((item) => {
      const key = item.productId || `name:${normalise(item.name)}`;
      const row = productPerformance.get(key) || {
        name: item.name || 'Unknown item',
        allTimeUnits: 0,
        allTimeRevenue: 0,
        todayUnits: 0,
        todayRevenue: 0,
        last7DaysUnits: 0,
        last7DaysRevenue: 0,
        thisMonthUnits: 0,
        thisMonthRevenue: 0,
      };
      row[`${period}Units`] += number(item.qty);
      row[`${period}Revenue`] += number(item.lineTotal);
      productPerformance.set(key, row);
    });
  };
  completedSales.forEach((sale) => addPerformance(sale, 'allTime'));
  todaySales.forEach((sale) => addPerformance(sale, 'today'));
  weekSales.forEach((sale) => addPerformance(sale, 'last7Days'));
  monthSales.forEach((sale) => addPerformance(sale, 'thisMonth'));

  const costByProduct = new Map(products.map((product) => [product.id, number(product.costPrice)]));
  const monthCostOfGoods = managementAccess
    ? monthSales.reduce(
        (total, sale) =>
          total +
          (sale.items || []).reduce(
            (lineTotal, item) =>
              lineTotal + number(item.qty) * number(costByProduct.get(item.productId)),
            0
          ),
        0
      )
    : 0;

  const stock = products
    .filter(() => niche?.trackStock)
    .map((product) => ({
      name: product.name,
      quantity: number(product.stock),
      price: number(product.salePrice),
    }))
    .sort((a, b) => a.quantity - b.quantity);

  const categoryMap = new Map();
  categories.forEach((category) => {
    const name = String(category?.name || category || 'General');
    categoryMap.set(name, { name, items: 0, stockUnits: 0, retailValue: 0 });
  });
  products.forEach((product) => {
    const name = product.category || 'General';
    const row = categoryMap.get(name) || { name, items: 0, stockUnits: 0, retailValue: 0 };
    const quantity = niche?.trackStock ? Math.max(0, number(product.stock)) : 0;
    row.items += 1;
    row.stockUnits += quantity;
    row.retailValue += quantity * number(product.salePrice);
    categoryMap.set(name, row);
  });

  const catalogueProducts = products.map((product) => {
    const performance =
      productPerformance.get(product.id) ||
      productPerformance.get(`name:${normalise(product.name)}`) || {
        allTimeUnits: 0,
        allTimeRevenue: 0,
        todayUnits: 0,
        todayRevenue: 0,
        last7DaysUnits: 0,
        last7DaysRevenue: 0,
        thisMonthUnits: 0,
        thisMonthRevenue: 0,
      };
    return {
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || 'General',
      quantity: niche?.trackStock ? number(product.stock) : null,
      salePrice: number(product.salePrice),
      ...(managementAccess ? { costPrice: number(product.costPrice) } : {}),
      ...(product.expiryDate ? { expiryDate: String(product.expiryDate).slice(0, 10) } : {}),
      ...(product.genericName ? { genericName: product.genericName } : {}),
      ...(product.strength ? { strength: product.strength } : {}),
      ...(product.dosageForm ? { dosageForm: product.dosageForm } : {}),
      ...(product.packSize ? { packSize: product.packSize } : {}),
      isPrescriptionOnly: Boolean(product.isRx || product.is_rx),
      isControlled: Boolean(product.isControlled || product.is_controlled),
      sales: performance,
    };
  });

  const monthExpenseRows = managementAccess
    ? expenses.filter((expense) => inWindow(expense.date || expense.createdAt, monthStart))
    : [];
  const monthExpenses = sum(monthExpenseRows, 'amount');
  const expenseCategories = {};
  monthExpenseRows.forEach((expense) => {
    const category = expense.category || 'Other';
    const row = expenseCategories[category] || { category, records: 0, total: 0 };
    row.records += 1;
    row.total += number(expense.amount);
    expenseCategories[category] = row;
  });

  const openCredits = completedSales
    .filter((sale) => ['Partial', 'Credit'].includes(sale.paymentMethod))
    .map((sale) => ({
      // A count and balance are enough for operational answers. Customer
      // identity remains inside the Credit Book and never enters StoreSense.
      balance: Math.max(0, number(sale.total) - number(sale.amountPaid)),
    }))
    .filter((credit) => credit.balance > 0);

  const monthPayments = creditPayments.filter((payment) => inWindow(payment.createdAt, monthStart));
  const roleCounts = {};
  team.forEach((member) => {
    const memberRole = member.role || 'cashier';
    roleCounts[memberRole] = (roleCounts[memberRole] || 0) + 1;
  });

  const monthVoidLogs = managementAccess
    ? voidLogs.filter((entry) => inWindow(entry.createdAt, monthStart))
    : [];

  // Pharmacy Mode uses operational aggregates and non-sensitive medicine,
  // batch and supplier labels. Patient, prescriber, staff-email and receipt
  // identity never enters the assistant context.
  const pharmacy = niche?.pharmacy
    ? (() => {
        const buckets = {
          expired: { units: 0, value: 0 },
          d30: { units: 0, value: 0 },
          d60: { units: 0, value: 0 },
          d90: { units: 0, value: 0 },
        };
        const batchStatus = {
          active: { batches: 0, units: 0 },
          quarantined: { batches: 0, units: 0 },
          recalled: { batches: 0, units: 0 },
        };
        const productNames = new Map(products.map((product) => [product.id, product.name]));
        const batchRecords = batches.map((batch) => {
          const status = batch.status || 'active';
          const statusRow = batchStatus[status] || { batches: 0, units: 0 };
          const quantity = Math.max(0, number(batch.qty));
          statusRow.batches += 1;
          statusRow.units += quantity;
          batchStatus[status] = statusRow;

          if (status === 'active') {
            const expiry = batch.expiryDate
              ? new Date(`${String(batch.expiryDate).slice(0, 10)}T00:00:00`)
              : null;
            if (expiry && !Number.isNaN(expiry.getTime()) && quantity > 0) {
              const days = Math.round((expiry - today) / (24 * 60 * 60 * 1000));
              if (days <= 90) {
                const bucket =
                  days < 0 ? 'expired' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'd90';
                buckets[bucket].units += quantity;
                buckets[bucket].value += quantity * number(batch.costPrice);
              }
            }
          }

          return {
            product: productNames.get(batch.productId) || 'Unknown medicine',
            batchNo: batch.batchNo || '',
            expiryDate: batch.expiryDate ? String(batch.expiryDate).slice(0, 10) : null,
            quantity,
            status,
            ...(managementAccess ? { supplier: batch.supplier || '' } : {}),
          };
        });

        const controlledMedicines = products.filter(
          (product) => product.isControlled || product.is_controlled
        );
        const controlledStock = controlledMedicines.map((product) =>
          Math.max(0, number(product.stock))
        );
        const rxMedicines = products.filter((product) => product.isRx || product.is_rx);
        const monthPurchases = managementAccess
          ? purchases.filter((purchase) => inWindow(purchase.createdAt, monthStart))
          : [];
        const prescriptionStatus = { open: 0, dispensed: 0, cancelled: 0 };
        const outstandingPrescriptionItems = {};
        prescriptions.forEach((prescription) => {
          const status = prescription.status || 'open';
          prescriptionStatus[status] = (prescriptionStatus[status] || 0) + 1;
          if (status !== 'open') return;
          (prescription.items || []).forEach((item) => {
            const remaining = Math.max(0, number(item.prescribedQty) - number(item.dispensedQty));
            if (!remaining) return;
            const name = item.productName || 'Unknown medicine';
            outstandingPrescriptionItems[name] =
              (outstandingPrescriptionItems[name] || 0) + remaining;
          });
        });
        const controlledSales = sales.filter((sale) =>
          (sale.items || []).some((item) => item.isControlled || item.is_controlled)
        );
        const atRiskValue =
          buckets.expired.value + buckets.d30.value + buckets.d60.value + buckets.d90.value;

        return {
          tracksBatches: true,
          prescriptionOnlyMedicineCount: rxMedicines.length,
          prescriptionOnlyStockUnits: rxMedicines.reduce(
            (total, product) => total + Math.max(0, number(product.stock)),
            0
          ),
          controlledMedicineCount: controlledMedicines.length,
          controlledMedicinesInStock: controlledStock.filter((quantity) => quantity > 0).length,
          controlledStockUnits: controlledStock.reduce((total, quantity) => total + quantity, 0),
          controlledDispensings: controlledSales.length,
          expiredUnits: buckets.expired.units,
          expiringIn30: buckets.d30.units,
          expiringIn60: buckets.d60.units,
          expiringIn90: buckets.d90.units,
          valueAtRisk: Math.round(atRiskValue),
          batchStatus,
          batches: batchRecords,
          suppliers: managementAccess
            ? {
                count: suppliers.length,
                names: suppliers.map((supplier) => supplier.name).filter(Boolean),
              }
            : { available: false },
          purchases: managementAccess
            ? {
                records: purchases.length,
                total: sum(purchases),
                thisMonthRecords: monthPurchases.length,
                thisMonthTotal: sum(monthPurchases),
              }
            : { available: false },
          prescriptions: {
            records: prescriptions.length,
            ...prescriptionStatus,
            outstandingUnits: Object.values(outstandingPrescriptionItems).reduce(
              (total, quantity) => total + quantity,
              0
            ),
            outstandingMedicines: Object.entries(outstandingPrescriptionItems).map(
              ([name, quantity]) => ({ name, quantity })
            ),
            dispensingEvents: dispensings.length,
          },
        };
      })()
    : { tracksBatches: false };

  const monthRevenue = sum(monthSales);
  const grossProfit = monthRevenue - monthCostOfGoods;
  const stockUnits = stock.reduce((total, product) => total + Math.max(0, product.quantity), 0);
  const stockCostValue = managementAccess
    ? products.reduce(
        (total, product) =>
          total + Math.max(0, number(product.stock)) * number(product.costPrice),
        0
      )
    : null;
  const stockRetailValue = products.reduce(
    (total, product) =>
      total + Math.max(0, number(product.stock)) * number(product.salePrice),
    0
  );

  return {
    storeName: storeName || 'your store',
    businessType: niche?.label || 'business',
    role: role || 'team member',
    currentScreen: currentPath,
    currency: 'NGN',
    storeProfile: {
      name: storeName || 'your store',
      businessType: niche?.label || 'business',
      plan: storeIsDemo ? 'owner-demo' : plan || 'unknown',
      billingCycle: billingCycle || null,
      currentUserRole: role || 'team member',
    },
    permissions: {
      management: managementAccess,
      team: teamAccess,
      ownerSettings: role === 'owner',
    },
    today: {
      sales: todaySales.length,
      units: saleUnits(todaySales),
      revenue: sum(todaySales),
    },
    last7Days: {
      sales: weekSales.length,
      units: saleUnits(weekSales),
      revenue: sum(weekSales),
    },
    thisMonth: {
      sales: monthSales.length,
      units: saleUnits(monthSales),
      revenue: monthRevenue,
      expenses: monthExpenses,
      ...(managementAccess
        ? {
            costOfGoods: monthCostOfGoods,
            grossProfit,
            netProfit: grossProfit - monthExpenses,
          }
        : {}),
    },
    salesOverview: {
      completedSales: completedSales.length,
      voidedSales: voidedSales.length,
      allTimeRevenue: sum(completedSales),
      allTimeUnits: saleUnits(completedSales),
      averageSale: completedSales.length ? sum(completedSales) / completedSales.length : 0,
      paymentMixThisMonth: Object.values(paymentMix).sort((a, b) => b.revenue - a.revenue),
    },
    catalogue: {
      items: products.length,
      trackStock: Boolean(niche?.trackStock),
      inStockCount: niche?.trackStock
        ? stock.filter((product) => product.quantity > 0).length
        : products.length,
      outOfStockCount: niche?.trackStock
        ? stock.filter((product) => product.quantity <= 0).length
        : 0,
      stockUnits,
      stockCostValue,
      stockRetailValue,
      potentialStockProfit:
        managementAccess && stockCostValue != null ? stockRetailValue - stockCostValue : null,
      lowStockCount: stock.filter((product) => product.quantity < 50).length,
      lowStock: stock.slice(0, 8),
      categories: [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      products: catalogueProducts,
    },
    pharmacy,
    topSellers: [...productPerformance.values()]
      .filter((product) => product.last7DaysUnits > 0)
      .sort((a, b) => b.last7DaysRevenue - a.last7DaysRevenue)
      .slice(0, 5)
      .map((product) => ({
        name: product.name,
        units: product.last7DaysUnits,
        revenue: product.last7DaysRevenue,
      })),
    creditBook: {
      openAccounts: openCredits.length,
      outstanding: openCredits.reduce((total, credit) => total + credit.balance, 0),
      paymentsRecorded: creditPayments.length,
      paymentsThisMonth: monthPayments.length,
      amountCollectedThisMonth: sum(monthPayments, 'amount'),
    },
    expenseBook: managementAccess
      ? {
          available: true,
          records: expenses.length,
          allTimeTotal: sum(expenses, 'amount'),
          thisMonthRecords: monthExpenseRows.length,
          thisMonthTotal: monthExpenses,
          categoriesThisMonth: Object.values(expenseCategories).sort((a, b) => b.total - a.total),
        }
      : { available: false },
    operations: managementAccess
      ? {
          voids: {
            records: voidLogs.length,
            totalValue: sum(voidLogs),
            thisMonthRecords: monthVoidLogs.length,
            thisMonthValue: sum(monthVoidLogs),
          },
        }
      : { available: false },
    team: teamAccess
      ? {
          available: true,
          members: team.length,
          approved: team.filter(
            (member) => (member.approvalStatus || member.approval_status || 'approved') === 'approved'
          ).length,
          pending: team.filter(
            (member) => (member.approvalStatus || member.approval_status) === 'pending'
          ).length,
          rejected: team.filter(
            (member) => (member.approvalStatus || member.approval_status) === 'rejected'
          ).length,
          roles: roleCounts,
          pharmacists: team.filter((member) => member.isPharmacist || member.is_pharmacist).length,
        }
      : { available: false },
    // The model receives a live, role-filtered operational snapshot. Personal
    // customer, patient and staff identity and raw transaction rows stay out.
    dataSource: 'live role-filtered store snapshot',
  };
}
function localReply(question, context) {
  const q = normalise(question);
  const {
    today,
    last7Days,
    thisMonth,
    salesOverview = {},
    catalogue,
    topSellers,
    creditBook,
    expenseBook = {},
    operations = {},
    team = {},
    pharmacy,
    storeProfile = {},
  } = context;
  const lowStock = catalogue.lowStock || [];
  const catalogueProducts = catalogue.products || [];

  if (!q) {
    return {
      answer:
        'Ask me about any live store area: products, stock, sales, payments, credit, expenses, profit, staff or store operations.',
    };
  }

  if (/\b(overview|summary|snapshot)\b/.test(q) || /\b(how is|how's)\b.*\b(store|shop|business)\b/.test(q)) {
    const details = [
      `${plural(today.sales, 'completed sale')} worth ${money(today.revenue)} today`,
      `${plural(catalogue.items, 'catalogue item')}`,
    ];
    if (catalogue.trackStock) details.push(`${plural(catalogue.stockUnits, 'unit')} in recorded stock`);
    if (creditBook.openAccounts) details.push(`${money(creditBook.outstanding)} open credit`);
    if (expenseBook.available) details.push(`${money(thisMonth.expenses)} in expenses this month`);
    if (team.available) details.push(`${plural(team.approved, 'approved team member')}`);
    return {
      answer: `${context.storeName} snapshot: ${details.join(', ')}. Ask about any one of these for a detailed live answer.`,
      action: { label: 'Open dashboard', route: '/dashboard' },
    };
  }

  if (/\b(plan|subscription|billing cycle)\b/.test(q) && /\b(what|which|current|our|my)\b/.test(q)) {
    const planLabel = String(storeProfile.plan || 'unknown').startsWith('owner')
      ? 'Owner Mode'
      : storeProfile.plan === 'free'
        ? 'Shop Mode'
        : storeProfile.plan || 'unknown';
    const cycle = storeProfile.billingCycle ? ` on ${storeProfile.billingCycle} billing` : '';
    return {
      answer: `${context.storeName} is currently on ${planLabel}${cycle}.`,
      action: { label: 'Open pricing', route: '/pricing' },
    };
  }

  if (
    /\b(team|staff|employee|employees|member|members|cashiers?|managers?|admins?)\b/.test(q) &&
    /\b(how many|number|count|total|have|pending|approved)\b/.test(q)
  ) {
    if (!team.available) {
      return {
        answer: 'Your role does not include the Team overview, so I will not expose its staff totals here.',
      };
    }
    const roles = Object.entries(team.roles || {})
      .filter(([, count]) => count > 0)
      .map(([name, count]) => plural(count, name))
      .join(', ');
    return {
      answer: `${context.storeName} has ${plural(team.members, 'team member')}: ${team.approved} approved, ${team.pending} pending and ${team.rejected || 0} rejected${roles ? ` (${roles})` : ''}.`,
      action: { label: 'Open Team', route: '/team' },
    };
  }

  if (/\b(categor(?:y|ies))\b/.test(q) && /\b(how many|number|count|total|have)\b/.test(q)) {
    const used = (catalogue.categories || []).filter((category) => category.items > 0).length;
    return {
      answer: `Inventory has ${plural((catalogue.categories || []).length, 'category', 'categories')}; ${used} currently contain catalogue items.`,
      action: { label: 'Open inventory', route: '/inventory' },
    };
  }

  const mentionedCategories = (catalogue.categories || []).filter((category) => {
    const name = normalise(category.name);
    return name.length >= 3 && q.includes(name);
  });
  if (
    mentionedCategories.length > 0 &&
    /\b(how many|number|count|total|have|stock|units|value|worth)\b/.test(q)
  ) {
    return {
      answer: mentionedCategories
        .slice(0, 3)
        .map(
          (category) =>
            `${category.name}: ${plural(category.items, 'item')} and ${plural(category.stockUnits, 'unit')} in recorded stock (${money(category.retailValue)} at selling prices)`
        )
        .join(' · '),
      action: { label: 'Open inventory', route: '/inventory' },
    };
  }

  if (
    !/\b(controlled|prescription|rx)\b/.test(q) &&
    /\b(products?|items?|catalogue|drugs?|medicines?)\b/.test(q) &&
    /\b(how many|number|count|total|have|out of stock|in stock)\b/.test(q)
  ) {
    if (/\bout of stock\b/.test(q)) {
      return {
        answer: `${plural(catalogue.outOfStockCount, 'catalogue item')} currently have${catalogue.outOfStockCount === 1 ? 's' : ''} no recorded stock.`,
        action: { label: 'Review inventory', route: '/inventory' },
      };
    }
    return {
      answer: catalogue.trackStock
        ? `You have ${plural(catalogue.items, 'catalogue item')}: ${catalogue.inStockCount} in stock and ${catalogue.outOfStockCount} out of stock, with ${plural(catalogue.stockUnits, 'unit')} recorded altogether.`
        : `You have ${plural(catalogue.items, 'catalogue item')}. This business type does not track quantities.`,
      action: { label: 'Open inventory', route: '/inventory' },
    };
  }

  const mentionedProducts = catalogueProducts.filter((product) => {
    const name = normalise(product.name);
    const generic = normalise(product.genericName);
    const sku = normalise(product.sku);
    if (
      (generic.length >= 3 && q.includes(generic)) ||
      (sku.length >= 2 && q.split(/[^a-z0-9-]+/).includes(sku))
    ) return true;
    if (name && q.includes(name)) return true;
    const words = name.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
    return words.length > 0 && q.includes(words[0]);
  });
  if (
    mentionedProducts.length > 0 &&
    /\b(how many|how much|stock|price|cost|have|details?|about|controlled|prescription|expiry|expires|sku|sell|sold|sales|revenue)\b/.test(q)
  ) {
    if (/\b(sell|sold|sales|revenue)\b/.test(q)) {
      const period = /\btoday\b/.test(q)
        ? { key: 'today', label: 'today' }
        : /\b(this month|monthly|month)\b/.test(q)
          ? { key: 'thisMonth', label: 'this month' }
          : /\b(last 7 days|this week|weekly|week)\b/.test(q)
            ? { key: 'last7Days', label: 'over the last 7 days' }
            : { key: 'allTime', label: 'across all completed sales' };
      return {
        answer: mentionedProducts
          .slice(0, 3)
          .map((product) => {
            const performance = product.sales || {};
            return `${product.name}: ${plural(performance[`${period.key}Units`] || 0, 'unit')} sold for ${money(performance[`${period.key}Revenue`] || 0)} ${period.label}`;
          })
          .join(' · '),
        action: { label: 'Open reports', route: '/reports' },
      };
    }

    const lines = mentionedProducts.slice(0, 3).map((product) => {
      const details = [];
      if (product.quantity != null) details.push(`${plural(product.quantity, 'unit')} in stock`);
      details.push(`selling at ${money(product.salePrice)}`);
      if (product.costPrice != null && /\b(cost|profit|margin|details?)\b/.test(q)) {
        details.push(`cost ${money(product.costPrice)}`);
      }
      if (product.sku) details.push(`SKU ${product.sku}`);
      if (product.isControlled) details.push('controlled');
      if (product.isPrescriptionOnly) details.push('prescription-only');
      if (product.expiryDate) details.push(`earliest expiry ${product.expiryDate}`);
      return `${product.name}: ${details.join(', ')}`;
    });
    return {
      answer: lines.join(' · '),
      action: { label: 'Review inventory', route: '/inventory' },
    };
  }

  if (
    /\b(inventory|stock)\b/.test(q) &&
    /\b(value|worth|valuation|potential profit|margin)\b/.test(q)
  ) {
    if (!catalogue.trackStock) {
      return {
        answer: 'This business type does not track stock quantities, so it has no inventory valuation in SmartStore.',
        action: { label: 'Open inventory', route: '/inventory' },
      };
    }
    if (catalogue.stockCostValue == null) {
      return {
        answer: 'Your role does not include inventory cost and profit values, so I will not expose them here.',
      };
    }
    return {
      answer: `Current recorded stock is worth ${money(catalogue.stockCostValue)} at cost and ${money(catalogue.stockRetailValue)} at selling prices, leaving ${money(catalogue.potentialStockProfit)} in potential gross profit if every unit sells.`,
      action: { label: 'Review inventory', route: '/inventory' },
    };
  }

  if (/\b(payment|cash|transfer|card|pos)\b/.test(q) && /\b(mix|breakdown|method|most|how much)\b/.test(q)) {
    const mix = salesOverview.paymentMixThisMonth || [];
    return {
      answer: mix.length
        ? `This month’s payment mix is ${mix.map((row) => `${row.method}: ${plural(row.sales, 'sale')} / ${money(row.revenue)}`).join(' · ')}.`
        : 'There are no completed sales in this month’s payment mix yet.',
      action: { label: 'Open reports', route: '/reports' },
    };
  }

  if (/\b(void|voided|cancelled sale|cancelled sales)\b/.test(q) && /\b(how many|number|count|total|value|month|have)\b/.test(q)) {
    if (!operations.voids) {
      return {
        answer: 'Your role does not include the void report, so I will not expose its totals here.',
      };
    }
    return {
      answer: `There are ${plural(operations.voids.records, 'void record')} worth ${money(operations.voids.totalValue)} in total; ${operations.voids.thisMonthRecords} worth ${money(operations.voids.thisMonthValue)} were recorded this month.`,
      action: { label: 'Open void report', route: '/reports/voids' },
    };
  }

  if (
    /\b(storesense|bulk|import|paste|raw|arrange|auto|automatic)\b.*\b(inventory|stock|product|item|sku|barcode)\b/.test(q) ||
    /\b(inventory|stock|product|item)\b.*\b(storesense|bulk|import|paste|raw|arrange|sku)\b/.test(q)
  ) {
    return {
      answer: 'Open Inventory and use StoreSense. Paste rough stock lines or a small table; StoreSense will arrange names, categories, cost, selling price, stock and generated SKUs, then you review before saving.',
      action: { label: 'Open StoreSense inventory', route: '/inventory' },
    };
  }

  if (
    /\b(add|create|edit|update|remove|delete|manage)\b.*\b(product|item|inventory)\b/.test(q) ||
    /\b(how do i|where can i)\b.*\b(product|item)\b/.test(q)
  ) {
    return {
      answer: 'Open Inventory to add, edit, remove or organise products. For many items at once, use StoreSense to paste raw stock inputs and generate SKUs before saving.',
      action: { label: 'Open inventory', route: '/inventory' },
    };
  }

  if (/\b(pos|register|checkout|barcode|receipt)\b/.test(q) && /\b(how|where|open|use|record)\b/.test(q)) {
    return {
      answer: 'Open POS Register to search or scan products, build the cart, choose Cash, Transfer, POS/Card, Partial or Credit, and complete or print the sale.',
      action: { label: 'Open POS Register', route: '/pos' },
    };
  }

  if (/\b(team|staff|employee|member|role|approval|approve)\b/.test(q) && /\b(how|where|manage|add|invite|approve|remove)\b/.test(q)) {
    return {
      answer: 'Use Team to invite staff, approve join requests, change roles and remove members. Some team controls require the right role or Owner Mode.',
      action: { label: 'Open Team', route: '/team' },
    };
  }

  if (/\b(setting|settings|store name|join code|billing|owner mode)\b/.test(q) && /\b(how|where|manage|change|open|upgrade)\b/.test(q)) {
    return {
      answer: 'Open Owner Settings for store controls and account-level options. Use Pricing for billing and Owner Mode, where available to the store owner.',
      action: { label: 'Open settings', route: '/owner-settings' },
    };
  }

  if (/\b(report|reports|analytics|profit|performance)\b/.test(q) && /\b(how|where|show|open|see|view)\b/.test(q)) {
    return {
      answer: 'Open Reports for revenue, cost of goods, profit, payment mix and top sellers. Expense analytics has its own report, and premium views still follow your plan.',
      action: { label: 'Open reports', route: '/reports' },
    };
  }

  if (/\b(supplier|suppliers)\b/.test(q) && /\b(how many|number|count|total|have|who)\b/.test(q)) {
    if (!pharmacy?.tracksBatches) {
      return { answer: 'Supplier records are part of Pharmacy Mode in this version of SmartStore.' };
    }
    if (pharmacy.suppliers?.available === false) {
      return { answer: 'Your role does not include supplier records, so I will not expose them here.' };
    }
    const names = pharmacy.suppliers?.names || [];
    return {
      answer: `You have ${plural(pharmacy.suppliers?.count || 0, 'supplier')}${names.length ? `: ${names.join(', ')}` : '.'}`,
      action: { label: 'Open suppliers', route: '/suppliers' },
    };
  }

  if (/\b(purchase|purchases|deliveries|delivery|stock received)\b/.test(q) && /\b(how many|number|count|total|value|month|have|spent)\b/.test(q)) {
    if (!pharmacy?.tracksBatches) {
      return { answer: 'Recorded purchases and batch deliveries are part of Pharmacy Mode in this version of SmartStore.' };
    }
    if (pharmacy.purchases?.available === false) {
      return { answer: 'Your role does not include purchase records, so I will not expose their totals here.' };
    }
    return {
      answer: `You have ${plural(pharmacy.purchases?.records || 0, 'recorded purchase')} worth ${money(pharmacy.purchases?.total)} in total. This month: ${plural(pharmacy.purchases?.thisMonthRecords || 0, 'delivery', 'deliveries')} worth ${money(pharmacy.purchases?.thisMonthTotal)}.`,
      action: { label: 'Open purchases', route: '/purchases' },
    };
  }

  if (/\b(prescription|prescriptions|scripts?)\b/.test(q) && /\b(how many|number|count|total|open|pending|dispensed|have)\b/.test(q)) {
    if (!pharmacy?.tracksBatches) {
      return { answer: 'Prescription tracking is available in Pharmacy Mode.' };
    }
    const prescriptions = pharmacy.prescriptions || {};
    return {
      answer: `You have ${plural(prescriptions.records || 0, 'prescription')}: ${prescriptions.open || 0} open, ${prescriptions.dispensed || 0} dispensed and ${prescriptions.cancelled || 0} cancelled. Open scripts still have ${plural(prescriptions.outstandingUnits || 0, 'unit')} to dispense.`,
      action: { label: 'Open prescriptions', route: '/prescriptions' },
    };
  }

  if (
    /\b(prescription-only|prescription drugs?|rx medicines?|rx drugs?)\b/.test(q) &&
    /\b(how many|number|count|total|have|stock)\b/.test(q)
  ) {
    if (!pharmacy?.tracksBatches) {
      return { answer: 'Prescription-only medicine tracking is available in Pharmacy Mode.' };
    }
    return {
      answer: `You have ${plural(pharmacy.prescriptionOnlyMedicineCount || 0, 'prescription-only medicine')} with ${plural(pharmacy.prescriptionOnlyStockUnits || 0, 'unit')} of recorded stock.`,
      action: { label: 'Review inventory', route: '/inventory' },
    };
  }

  if (/\b(batch|batches)\b/.test(q) && /\b(how many|number|count|status|active|quarantined|recalled|have)\b/.test(q) && !/\b(expiry|expiring|expired|expire|expires)\b/.test(q)) {
    if (!pharmacy?.tracksBatches) {
      return { answer: 'Batch tracking is available in Pharmacy Mode.' };
    }
    const status = pharmacy.batchStatus || {};
    return {
      answer: `Batch inventory has ${plural(status.active?.batches || 0, 'active batch')} (${plural(status.active?.units || 0, 'unit')}), ${status.quarantined?.batches || 0} quarantined and ${status.recalled?.batches || 0} recalled.`,
      action: { label: 'Open inventory', route: '/inventory' },
    };
  }

  if (/\bcontrolled\b/.test(q) && /\b(dispens|sold|sales|register|history)\w*\b/.test(q)) {
    if (!pharmacy?.tracksBatches) {
      return { answer: 'Controlled-medicine tracking is available in Pharmacy Mode.' };
    }
    return {
      answer: `The Controlled Register currently contains ${plural(pharmacy.controlledDispensings || 0, 'controlled dispensing')}.`,
      action: { label: 'Open Controlled Register', route: '/controlled-register' },
    };
  }

  // A controlled-medicine "how many" can mean catalogue records or physical
  // units. Answer with both, directly from the current inventory aggregate.
  if (
    /\bcontrolled\b/.test(q) &&
    /\b(how many|number|count|total|currently|current|have|stock|stocked|inventory|catalogue)\b/.test(q)
  ) {
    if (!pharmacy?.tracksBatches) {
      return {
        answer:
          'Controlled-medicine tracking is available in Pharmacy Mode, but this store is not configured as a pharmacy.',
        action: { label: 'Open inventory', route: '/inventory' },
      };
    }

    const controlledCount = Number(pharmacy.controlledMedicineCount) || 0;
    const inStockCount = Number(pharmacy.controlledMedicinesInStock) || 0;
    const stockUnits = Number(pharmacy.controlledStockUnits) || 0;
    if (!controlledCount) {
      return {
        answer: 'No medicines are marked as controlled in Inventory right now.',
        action: { label: 'Open inventory', route: '/inventory' },
      };
    }
    if (!inStockCount) {
      return {
        answer: `You have ${plural(controlledCount, 'controlled medicine')} listed in Inventory, but none currently has recorded stock.`,
        action: { label: 'Review controlled inventory', route: '/inventory' },
      };
    }
    return {
      answer: `You currently have ${plural(controlledCount, 'controlled medicine')} listed in Inventory, with ${plural(stockUnits, 'unit')} of recorded stock across ${plural(inStockCount, 'medicine')} currently in stock.`,
      action: { label: 'Review controlled inventory', route: '/inventory' },
    };
  }

  // Pharmacy expiry questions: answered from batch aggregates. StoreSense
  // helps run the shelves; it never advises on what a patient should take.
  if (/\b(expiry|expiring|expired|expire|expires|batch\w*|going bad|spoiling)\b/.test(q)) {
    if (!pharmacy?.tracksBatches) {
      return {
        answer:
          'This business type does not track batches and expiry dates in SmartStore, so I cannot answer expiry questions for it.',
        action: { label: 'Open inventory', route: '/inventory' },
      };
    }
    const p = pharmacy;
    const valueFmt = money(p.valueAtRisk);
    if (!p.expiredUnits && !p.expiringIn30 && !p.expiringIn60 && !p.expiringIn90) {
      return {
        answer:
          'No active batch expires in the next 90 days. The Expiry watch on your Dashboard and Inventory page keeps monitoring every batch.',
        action: { label: 'Open inventory', route: '/inventory' },
      };
    }
    const bits = [];
    if (p.expiredUnits) bits.push(`${plural(p.expiredUnits, 'unit')} already expired`);
    if (p.expiringIn30) bits.push(`${plural(p.expiringIn30, 'unit')} expiring within 30 days`);
    if (p.expiringIn60) bits.push(`${plural(p.expiringIn60, 'unit')} within 60 days`);
    if (p.expiringIn90) bits.push(`${plural(p.expiringIn90, 'unit')} within 90 days`);
    return {
      answer: `Expiry watch: ${bits.join(', ')}. About ${valueFmt} of stock at cost is at risk. Quarantine anything expired from its batch drawer so it can never be dispensed, and plan markdowns or returns for what is close.`,
      action: { label: 'Review expiry watch', route: '/inventory' },
    };
  }

  if (/\b(stock|restock\w*|inventory|shelf|low|running out|out of)\b/.test(q)) {
    if (!catalogue.trackStock) {
      return {
        answer: 'This business type does not track stock quantities in SmartStore, so I cannot flag restocks. You can still manage your catalogue from Inventory.',
        action: { label: 'Open inventory', route: '/inventory' },
      };
    }
    if (!catalogue.lowStockCount) {
      return {
        answer: 'Your stock looks healthy right now; nothing is below the 50-unit low-stock threshold.',
        action: { label: 'Open inventory', route: '/inventory' },
      };
    }
    const list = lowStock
      .slice(0, 3)
      .map((product) => `${product.name} (${product.quantity} left)`)
      .join(', ');
    return {
      answer: `${plural(catalogue.lowStockCount, 'item')} need${catalogue.lowStockCount === 1 ? 's' : ''} attention. The most urgent ${lowStock.length > 1 ? 'are' : 'is'} ${list}. I’d review these before your next restock run.`,
      action: { label: 'Review inventory', route: '/inventory' },
    };
  }

  if (/\b(sales?|revenue|turnover|today|doing|performance)\b/.test(q)) {
    return {
      answer: `Today you have ${plural(today.sales, 'completed sale')} worth ${money(today.revenue)}. Over the last 7 days, ${plural(last7Days.sales, 'sale')} brought in ${money(last7Days.revenue)}. This month stands at ${plural(thisMonth.sales, 'sale')} and ${money(thisMonth.revenue)}.`,
      action: { label: 'See sales history', route: '/sales' },
    };
  }

  if (/\b(top|best|popular|selling|sell|product)\b/.test(q)) {
    if (!topSellers.length) {
      return {
        answer: 'There are no completed sales in the last 7 days yet, so I do not have a best seller to rank. Once sales come in, I can compare them here.',
        action: { label: 'Open POS', route: '/pos' },
      };
    }
    const list = topSellers
      .slice(0, 3)
      .map((product, index) => `${index + 1}. ${product.name} (${product.units} sold)`)
      .join(' · ');
    return {
      answer: `Your top sellers over the last 7 days are ${list}. Use this list when deciding what to keep visible at the till.`,
      action: { label: 'Open reports', route: '/reports' },
    };
  }

  if (/\b(credit|debt|owe|owing|repayment|customer)\b/.test(q)) {
    if (!creditBook.openAccounts) {
      return {
        answer: 'Your Credit Book has no open balances right now. New Partial or Credit sales will appear there automatically.',
        action: { label: 'Open Credit Book', route: '/credit' },
      };
    }
    return {
      answer: `There ${creditBook.openAccounts === 1 ? 'is' : 'are'} ${plural(creditBook.openAccounts, 'open account')} with ${money(creditBook.outstanding)} outstanding. This month, ${plural(creditBook.paymentsThisMonth, 'repayment')} brought in ${money(creditBook.amountCollectedThisMonth)}.`,
      action: { label: 'Open Credit Book', route: '/credit' },
    };
  }

  if (/\b(expense|profit|cost|spend|spending)\b/.test(q)) {
    if (!expenseBook.available) {
      return {
        answer: 'Your role does not include expense and profit reports, so I will not expose those totals here.',
      };
    }
    return {
      answer: `This month’s revenue is ${money(thisMonth.revenue)}, cost of goods is ${money(thisMonth.costOfGoods)}, and ${plural(expenseBook.thisMonthRecords, 'expense')} total ${money(thisMonth.expenses)}. Estimated net profit is ${money(thisMonth.netProfit)}.`,
      action: { label: 'Review expenses', route: '/expenses' },
    };
  }

  if (/\b(how|help|can you|where|what can)\b/.test(q)) {
    return {
      answer: 'I use your live, role-filtered store snapshot across products, categories, stock, sales, payment mix, credit, expenses, profit, voids, team and plan details, plus pharmacy operations when enabled. I can also guide you through every SmartStore screen and StoreSense inventory input.',
    };
  }

  return {
    answer: `I’m using the live snapshot for ${context.storeName}. Try “Give me a store overview”, “How many products do we have?”, “What is Peak Milk’s stock?”, “Show this month’s payment mix”, or ask about sales, credit, expenses, staff and operations.`,
  };
}

/** Ask the configured server-side AI, falling back to useful local insights. */
export async function askAssistant(question, context) {
  const configuredEndpoint = import.meta.env.VITE_AI_ASSISTANT_URL;
  const endpoint = configuredEndpoint || DEFAULT_ENDPOINT;

  // Local/demo mode stays genuinely offline unless a developer explicitly
  // points it at a protected endpoint. Live Supabase users use the bundled
  // endpoint and send their short-lived bearer token.
  if (!configuredEndpoint && api.kind !== 'supabase') {
    return { ...localReply(question, context), mode: 'insights' };
  }

  try {
    const accessToken = await api.auth.getAccessToken?.();
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: String(question).slice(0, 500), context }),
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload?.answer) {
        return {
          answer: String(payload.answer).trim(),
          action: payload.action || null,
          mode: 'ai',
        };
      }
    }
  } catch {
    // The optional endpoint may not exist in local demo mode. The local
    // assistant is deliberately useful without network access.
  }

  return { ...localReply(question, context), mode: 'insights' };
}

export { localReply };
