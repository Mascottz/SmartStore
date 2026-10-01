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
  it('builds a live operational snapshot from store data without customer identity', () => {
    const context = buildAssistantContext(baseData);

    expect(context.storeName).toBe('Ada’s Market');
    expect(context.today).toEqual({ sales: 1, units: 2, revenue: 2400 });
    expect(context.salesOverview).toMatchObject({
      completedSales: 1,
      allTimeRevenue: 2400,
      allTimeUnits: 2,
    });
    expect(context.catalogue.lowStockCount).toBe(1);
    expect(context.catalogue.lowStock[0]).toMatchObject({ name: 'Peak Milk', quantity: 4 });
    expect(context.catalogue.products[0]).toMatchObject({
      name: 'Peak Milk',
      quantity: 4,
      salePrice: 1200,
    });
    expect(context.topSellers[0]).toMatchObject({ name: 'Peak Milk', units: 2, revenue: 2400 });
    expect(JSON.stringify(context)).not.toContain('customerName');
  });

  it('covers store operations beyond sales and pharmacy data', () => {
    const context = buildAssistantContext({
      ...baseData,
      plan: 'owner',
      billingCycle: 'monthly',
      categories: [{ name: 'Dairy' }, { name: 'Grains' }],
      expenses: [
        { amount: 500, category: 'Transport', date: new Date().toISOString() },
      ],
      voidLogs: [
        { total: 1200, createdAt: new Date().toISOString() },
      ],
      team: [
        { role: 'owner', approvalStatus: 'approved' },
        { role: 'cashier', approvalStatus: 'pending' },
      ],
    });

    expect(context.storeProfile).toMatchObject({ plan: 'owner', billingCycle: 'monthly' });
    expect(context.catalogue.categories).toHaveLength(3);
    expect(context.expenseBook).toMatchObject({
      available: true,
      records: 1,
      thisMonthTotal: 500,
    });
    expect(context.operations.voids).toMatchObject({ records: 1, totalValue: 1200 });
    expect(context.team).toMatchObject({ members: 2, approved: 1, pending: 1 });

    expect(localReply('How many products do we have?', context).answer).toContain(
      '2 catalogue items'
    );
    expect(localReply('How many Peak Milk units did we sell today?', context).answer).toContain(
      '2 units sold'
    );
    expect(localReply('How many staff do we have?', context).answer).toContain(
      '2 team members'
    );
  });

  it('answers stock questions with a useful next step', () => {
    const context = buildAssistantContext(baseData);
    const result = localReply('What needs restocking?', context);

    expect(result.answer).toContain('Peak Milk');
    expect(result.action).toEqual({ label: 'Review inventory', route: '/inventory' });
  });

  it('routes how-to questions for app actions to the right screen', () => {
    const context = buildAssistantContext(baseData);
    const result = localReply('How do I add a product?', context);

    expect(result.answer).toContain('Inventory');
    expect(result.action).toEqual({ label: 'Open inventory', route: '/inventory' });
  });

  it('points bulk inventory requests to StoreSense input', () => {
    const context = buildAssistantContext(baseData);
    const result = localReply('Can StoreSense arrange raw inventory and add SKUs?', context);

    expect(result.answer).toContain('StoreSense');
    expect(result.answer).toContain('generated SKUs');
    expect(result.action).toEqual({ label: 'Open StoreSense inventory', route: '/inventory' });
  });

  it('answers controlled-drug counts from current pharmacy inventory', () => {
    const context = buildAssistantContext({
      ...baseData,
      niche: { label: 'Pharmacy', trackStock: true, pharmacy: true },
      products: [
        { id: 'tramadol', name: 'Tramadol', stock: 12, isControlled: true },
        { id: 'codeine', name: 'Codeine', stock: 0, isControlled: true },
        { id: 'ors', name: 'ORS', stock: 40, isControlled: false },
      ],
      batches: [],
    });

    expect(context.pharmacy).toMatchObject({
      controlledMedicineCount: 2,
      controlledMedicinesInStock: 1,
      controlledStockUnits: 12,
    });

    const result = localReply('How many controlled drugs do we currently have?', context);

    expect(result.answer).toContain('2 controlled medicines');
    expect(result.answer).toContain('12 units');
    expect(result.answer).toContain('1 medicine currently in stock');
    expect(result.action).toEqual({
      label: 'Review controlled inventory',
      route: '/inventory',
    });
  });

  it('does not invent an open debt when the credit book is clear', () => {
    const context = buildAssistantContext(baseData);
    const result = localReply('How much credit is open?', context);

    expect(result.answer).toContain('no open balances');
    expect(result.action.route).toBe('/credit');
  });
});
