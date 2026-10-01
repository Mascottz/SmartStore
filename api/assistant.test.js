import { describe, expect, it } from 'vitest';
import { trimContext } from './assistant';

describe('StoreSense server snapshot boundary', () => {
  it('keeps role-filtered operational sections and removes private identity fields', () => {
    const result = trimContext({
      storeName: 'Ada Stores',
      businessType: 'Pharmacy',
      role: 'owner',
      storeProfile: { plan: 'owner', currentUserRole: 'owner' },
      salesOverview: { completedSales: 12, allTimeRevenue: 45000 },
      catalogue: {
        items: 1,
        products: [
          {
            name: 'Tramadol 50mg',
            quantity: 8,
            salePrice: 1800,
            isControlled: true,
            customerName: 'must not leave the app',
          },
        ],
      },
      pharmacy: {
        controlledMedicineCount: 1,
        controlledStockUnits: 8,
        prescriptions: {
          open: 2,
          patientName: 'must not leave the app',
        },
      },
      team: { available: true, members: 3, email: 'private@example.com' },
      rawReceipts: [{ receiptNo: 'SM-001' }],
    });

    expect(result.salesOverview).toEqual({ completedSales: 12, allTimeRevenue: 45000 });
    expect(result.catalogue.products[0]).toMatchObject({
      name: 'Tramadol 50mg',
      quantity: 8,
      isControlled: true,
    });
    expect(result.catalogue.products[0]).not.toHaveProperty('customerName');
    expect(result.pharmacy.prescriptions).not.toHaveProperty('patientName');
    expect(result.team).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('rawReceipts');
  });

  it('enforces the server-resolved role over a crafted client snapshot', () => {
    const result = trimContext(
      {
        role: 'owner',
        thisMonth: {
          revenue: 10000,
          expenses: 3000,
          costOfGoods: 2000,
          netProfit: 5000,
        },
        catalogue: {
          products: [{ name: 'Peak Milk', quantity: 4, costPrice: 500 }],
          stockCostValue: 2000,
        },
        expenseBook: { available: true, allTimeTotal: 3000 },
        operations: { voids: { records: 2 } },
        team: { available: true, members: 4 },
      },
      {
        role: 'cashier',
        store: { name: 'Ada Stores', plan: 'owner', billing_cycle: 'monthly' },
      }
    );

    expect(result.role).toBe('cashier');
    expect(result.storeName).toBe('Ada Stores');
    expect(result.storeProfile).toMatchObject({
      plan: 'owner',
      billingCycle: 'monthly',
      currentUserRole: 'cashier',
    });
    expect(result.thisMonth).toEqual({ revenue: 10000 });
    expect(result.catalogue.products[0]).not.toHaveProperty('costPrice');
    expect(result.expenseBook).toEqual({ available: false });
    expect(result.operations).toEqual({ available: false });
    expect(result.team).toEqual({ available: false });
  });
});
