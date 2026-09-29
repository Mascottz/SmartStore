import { describe, expect, it } from 'vitest';
import { buildAssistantContext, localReply } from './assistant';

const now = new Date();
const saleDate = new Date(now);
saleDate.setHours(10, 0, 0, 0);

const baseData = {
  storeName: 'Ada’s Market',
  role: 'owner',
  niche: { label: 'Supermarket', trackStock: true },
  products: [
    { id: 'milk', name: 'Peak Milk', stock: 4, salePrice: 1200 },
    { id: 'rice', name: 'Rice 5kg', stock: 80, salePrice: 9000 },
  ],
  sales: [
    {
      id: 'sale-1',
      status: 'completed',
      total: 2400,
      createdAt: saleDate.toISOString(),
      paymentMethod: 'Cash',
      amountPaid: 2400,
      items: [{ productId: 'milk', name: 'Peak Milk', qty: 2, lineTotal: 2400 }],
    },
  ],
  expenses: [],
  creditPayments: [],
};

describe('SmartStore assistant insights', () => {
  it('builds a compact aggregate context from store data', () => {
    const context = buildAssistantContext(baseData);

    expect(context.storeName).toBe('Ada’s Market');
    expect(context.today).toEqual({ sales: 1, revenue: 2400 });
    expect(context.catalogue.lowStockCount).toBe(1);
    expect(context.catalogue.lowStock[0]).toMatchObject({ name: 'Peak Milk', quantity: 4 });
    expect(context.topSellers[0]).toMatchObject({ name: 'Peak Milk', units: 2, revenue: 2400 });
    expect(context).not.toHaveProperty('customerName');
  });

  it('answers stock questions with a useful next step', () => {
    const context = buildAssistantContext(baseData);
    const result = localReply('What needs restocking?', context);

    expect(result.answer).toContain('Peak Milk');
    expect(result.action).toEqual({ label: 'Review inventory', route: '/inventory' });
  });

  it('does not invent an open debt when the credit book is clear', () => {
    const context = buildAssistantContext(baseData);
    const result = localReply('How much credit is open?', context);

    expect(result.answer).toContain('no open balances');
    expect(result.action.route).toBe('/credit');
  });
});
