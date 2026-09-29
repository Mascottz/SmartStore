// Lightweight assistant orchestration. The browser only sends an intentionally
// small, aggregate store snapshot to the optional server endpoint; customer
// names, email addresses and raw receipts never leave the app.
import { api } from './backend';

const DEFAULT_ENDPOINT = '/api/assistant';

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
  sales = [],
  products = [],
  expenses = [],
  creditPayments = [],
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

  return {
    storeName: storeName || 'your store',
    businessType: niche?.label || 'business',
    role: role || 'team member',
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
  const { today, last7Days, thisMonth, catalogue, topSellers, creditBook } = context;
  const lowStock = catalogue.lowStock || [];

  if (!q) {
    return {
      answer: 'Ask me about sales, stock, top sellers, expenses, credit, or how to use SmartStore.',
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
        answer: 'Your stock looks healthy right now — nothing is below the 50-unit low-stock threshold.',
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
      answer: 'I can give quick answers about sales, restocking, best sellers, expenses and outstanding credit. I can also take you straight to the relevant SmartStore screen.',
    };
  }

  return {
    answer: `I can help you run ${context.storeName}. Try “How are sales today?”, “What needs restocking?”, “What is selling best?”, or “How much credit is open?”`,
  };
}

/** Ask the configured server-side AI, falling back to useful local insights. */
export async function askAssistant(question, context) {
  const endpoint = import.meta.env.VITE_AI_ASSISTANT_URL || DEFAULT_ENDPOINT;

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
