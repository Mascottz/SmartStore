// Lightweight assistant orchestration. The browser only sends an intentionally
// small, aggregate store snapshot to the optional server endpoint; customer
// names, email addresses and raw receipts never leave the app.
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
 * Keep the context compact and safe for an LLM request. This is also the
 * source used by the local fallback, so demo mode and live mode behave alike.
 */
export function buildAssistantContext({
  storeName,
  niche,
  role,
  currentPath = '/',
  sales = [],
  products = [],
  expenses = [],
  creditPayments = [],
  batches = [],
}) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completedSales = sales.filter((sale) => sale.status === 'completed');
  const inWindow = (date, start) => date && new Date(date) >= start;
  const todaySales = completedSales.filter((sale) => inWindow(sale.createdAt, today));
  const weekSales = completedSales.filter((sale) => inWindow(sale.createdAt, sevenDaysAgo));
  const monthSales = completedSales.filter((sale) => inWindow(sale.createdAt, monthStart));
  const sum = (items) => items.reduce((total, item) => total + Number(item.total || 0), 0);

  const topProducts = {};
  weekSales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const current = topProducts[item.name] || { name: item.name, units: 0, revenue: 0 };
      current.units += Number(item.qty || 0);
      current.revenue += Number(item.lineTotal || 0);
      topProducts[item.name] = current;
    });
  });

  const openCredits = completedSales
    .filter((sale) => ['Partial', 'Credit'].includes(sale.paymentMethod))
    .map((sale) => ({
      // Keep the customer out of the model context. The count and amount are
      // enough for an operational answer and are less sensitive.
      balance: Math.max(0, Number(sale.total || 0) - Number(sale.amountPaid || 0)),
    }))
    .filter((credit) => credit.balance > 0);

  const stock = products
    .filter(() => niche?.trackStock)
    .map((product) => ({
      name: product.name,
      quantity: Number(product.stock || 0),
      // Price is useful for a restock priority, but no supplier/customer data
      // is included.
      price: Number(product.salePrice || 0),
    }))
    .sort((a, b) => a.quantity - b.quantity);

  const monthExpenses = expenses
    .filter((expense) => inWindow(expense.date || expense.createdAt, monthStart))
    .reduce((total, expense) => total + Number(expense.amount || 0), 0);

  // Pharmacy Mode: batch aggregates only — no patient or prescription data
  // ever enters the assistant context. Expired and near-expiry stock is the
  // operational question StoreSense answers best.
  const pharmacy = niche?.pharmacy
    ? (() => {
        const buckets = { expired: { units: 0, value: 0 }, d30: { units: 0, value: 0 }, d60: { units: 0, value: 0 }, d90: { units: 0, value: 0 } };
        batches.forEach((batch) => {
          if ((batch.status || 'active') !== 'active') return;
          const expiry = batch.expiryDate ? new Date(`${String(batch.expiryDate).slice(0, 10)}T00:00:00`) : null;
          if (!expiry || Number.isNaN(expiry.getTime())) return;
          const qty = Number(batch.qty) || 0;
          if (qty <= 0) return;
          const days = Math.round((expiry - today) / (24 * 60 * 60 * 1000));
          if (days > 90) return;
          const bucket = days < 0 ? 'expired' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'd90';
          buckets[bucket].units += qty;
          buckets[bucket].value += qty * (Number(batch.costPrice) || 0);
        });
        const atRiskValue =
          buckets.expired.value + buckets.d30.value + buckets.d60.value + buckets.d90.value;
        return {
          tracksBatches: true,
          expiredUnits: buckets.expired.units,
          expiringIn30: buckets.d30.units,
          expiringIn60: buckets.d60.units,
          expiringIn90: buckets.d90.units,
          valueAtRisk: Math.round(atRiskValue),
        };
      })()
    : { tracksBatches: false };

  return {
    storeName: storeName || 'your store',
    businessType: niche?.label || 'business',
    role: role || 'team member',
    currentScreen: currentPath,
    currency: 'NGN',
    today: {
      sales: todaySales.length,
      revenue: sum(todaySales),
    },
    last7Days: {
      sales: weekSales.length,
      revenue: sum(weekSales),
    },
    thisMonth: {
      sales: monthSales.length,
      revenue: sum(monthSales),
      expenses: monthExpenses,
    },
    catalogue: {
      items: products.length,
      trackStock: Boolean(niche?.trackStock),
      lowStockCount: stock.filter((product) => product.quantity < 50).length,
      lowStock: stock.slice(0, 8),
    },
    pharmacy,
    topSellers: Object.values(topProducts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    creditBook: {
      openAccounts: openCredits.length,
      outstanding: openCredits.reduce((total, credit) => total + credit.balance, 0),
      paymentsRecorded: creditPayments.length,
    },
    // This field is intentionally aggregate-only and helps the UI explain
    // which answer mode was used without exposing an API key.
    dataSource: 'store aggregates',
  };
}

function localReply(question, context) {
  const q = normalise(question);
  const { today, last7Days, thisMonth, catalogue, topSellers, creditBook, pharmacy } = context;
  const lowStock = catalogue.lowStock || [];

  if (!q) {
    return {
      answer: 'Ask me about sales, stock, top sellers, expenses, credit, or how to use SmartStore.',
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
      answer: `Today you have ${plural(today.sales, 'completed sale')} worth ${money(today.revenue)}. Over the last 7 days, ${plural(last7Days.sales, 'sale')} brought in ${money(last7Days.revenue)}.`,
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
      answer: `There ${creditBook.openAccounts === 1 ? 'is' : 'are'} ${plural(creditBook.openAccounts, 'open account')} with ${money(creditBook.outstanding)} outstanding. Keep repayments recorded in the Credit Book so the balance stays accurate.`,
      action: { label: 'Open Credit Book', route: '/credit' },
    };
  }

  if (/\b(expense|profit|cost|spend|spending)\b/.test(q)) {
    const grossHint = thisMonth.revenue - thisMonth.expenses;
    return {
      answer: `This month’s completed-sale revenue is ${money(thisMonth.revenue)} and recorded expenses are ${money(thisMonth.expenses)}. That leaves ${money(grossHint)} before cost of goods, so add every running cost for a clearer picture.`,
      action: { label: 'Review expenses', route: '/expenses' },
    };
  }

  if (/\b(how|help|can you|where|what can)\b/.test(q)) {
    return {
      answer: 'I can answer questions and guide you through every SmartStore area: POS, inventory, sales, credit, reports, expenses, team, approvals, settings and billing. I can also point you to StoreSense inventory input for raw stock lists and generated SKUs. I will follow the permissions of your role and plan.',
    };
  }

  return {
    answer: `I can help you run ${context.storeName} across the whole app. Try “How are sales today?”, “What needs restocking?”, “Import raw inventory”, “How do I manage my team?”, or “How much credit is open?”`,
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
