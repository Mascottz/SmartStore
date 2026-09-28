// Partial / credit sales and the repayment ledger in the local backend.
//
// The Credit Book relies on two invariants pinned here: a credit-type sale
// always records who owes the money and how much has been paid so far, and a
// repayment record moves the sale's amountPaid by exactly its amount,
// including when a record is deleted again.
import { beforeEach, describe, expect, it } from 'vitest';
import { localAdapter as api } from './local';

const makeCart = (productId, qty = 1, price = 200) => [
  { productId, name: 'Test Item', qty, price, lineTotal: qty * price },
];

async function seedStore() {
  const store = await api.stores.create('user-1', 'owner@shop.com', {
    name: 'Credit Corner',
    type: 'supermarket',
    categories: [],
  });
  const product = await api.products.create(store.id, {
    name: 'Test Item',
    sku: 'T-1',
    category: 'General',
    costPrice: 100,
    salePrice: 200,
    stock: 50,
  });
  return { store, product };
}

const sell = (storeId, items, extra = {}) =>
  api.sales.create(storeId, {
    items,
    paymentMethod: 'Cash',
    receiptNo: 'SM-1',
    cashierEmail: 'owner@shop.com',
    trackStock: true,
    ...extra,
  });

beforeEach(() => {
  localStorage.clear();
});

describe('credit-type sales', () => {
  it('records full payment for the till methods', async () => {
    const { store, product } = await seedStore();
    for (const method of ['Cash', 'Transfer', 'POS/Card']) {
      const sale = await sell(store.id, makeCart(product.id), { paymentMethod: method });
      expect(sale.amountPaid).toBe(sale.total);
      expect(sale.customerName).toBe('');
    }
  });

  it('keeps the part payment and customer name on a Partial sale', async () => {
    const { store, product } = await seedStore();
    const sale = await sell(store.id, makeCart(product.id, 2), {
      paymentMethod: 'Partial',
      amountPaid: 100,
      customerName: 'Mama Ngozi',
    });
    expect(sale.total).toBe(400);
    expect(sale.amountPaid).toBe(100);
    expect(sale.customerName).toBe('Mama Ngozi');
  });

  it('requires a customer name for Partial and Credit', async () => {
    const { store, product } = await seedStore();
    await expect(
      sell(store.id, makeCart(product.id), { paymentMethod: 'Partial', amountPaid: 50 })
    ).rejects.toThrow(/customer's name/i);
    await expect(
      sell(store.id, makeCart(product.id), { paymentMethod: 'Credit' })
    ).rejects.toThrow(/customer's name/i);
  });

  it('rejects a part payment that is zero, negative, or covers the whole bill', async () => {
    const { store, product } = await seedStore();
    const cart = makeCart(product.id);
    for (const amountPaid of [0, -50, 200, 250, Number.NaN]) {
      await expect(
        sell(store.id, cart, {
          paymentMethod: 'Partial',
          amountPaid,
          customerName: 'X',
        })
      ).rejects.toThrow();
    }
  });

  it('records a Credit sale with nothing paid', async () => {
    const { store, product } = await seedStore();
    const sale = await sell(store.id, makeCart(product.id), {
      paymentMethod: 'Credit',
      customerName: 'Chidi Okeke',
    });
    expect(sale.amountPaid).toBe(0);
    expect(sale.total).toBe(200);
  });
});

describe('repayment ledger', () => {
  it('moves the sale balance with each repayment until settled', async () => {
    const { store, product } = await seedStore();
    const sale = await sell(store.id, makeCart(product.id, 2), {
      paymentMethod: 'Partial',
      amountPaid: 100,
      customerName: 'Mama Ngozi',
    });

    const p1 = await api.creditPayments.add(store.id, {
      saleId: sale.id,
      amount: 200,
      method: 'Transfer',
      note: 'half',
      receivedBy: 'owner@shop.com',
    });
    expect(p1.receiptNo).toBe(sale.receiptNo);
    expect((await api.sales.list(store.id))[0].amountPaid).toBe(300);

    await api.creditPayments.add(store.id, {
      saleId: sale.id,
      amount: 100,
      method: 'Cash',
      note: '',
      receivedBy: 'owner@shop.com',
    });
    const settled = (await api.sales.list(store.id))[0];
    expect(settled.amountPaid).toBe(400);

    // Nothing left to collect.
    await expect(
      api.creditPayments.add(store.id, { saleId: sale.id, amount: 50 })
    ).rejects.toThrow(/already settled/i);

    const ledger = await api.creditPayments.list(store.id);
    expect(ledger).toHaveLength(2);
    // Both repayments are recorded against the same sale and customer.
    expect(ledger.map((p) => p.amount).sort((a, b) => a - b)).toEqual([100, 200]);
    expect(ledger.every((p) => p.customerName === 'Mama Ngozi')).toBe(true);
  });

  it('rejects overpayment, zero amounts, unknown and voided sales', async () => {
    const { store, product } = await seedStore();
    const sale = await sell(store.id, makeCart(product.id, 2), {
      paymentMethod: 'Credit',
      customerName: 'Chidi',
    });
    await expect(
      api.creditPayments.add(store.id, { saleId: sale.id, amount: 401 })
    ).rejects.toThrow(/more than the outstanding/i);
    await expect(
      api.creditPayments.add(store.id, { saleId: sale.id, amount: 0 })
    ).rejects.toThrow(/valid payment amount/i);
    await expect(
      api.creditPayments.add(store.id, { saleId: 'nope', amount: 10 })
    ).rejects.toThrow(/not found/i);

    await api.sales.void(sale.id, 'changed mind', 'owner@shop.com', true);
    await expect(
      api.creditPayments.add(store.id, { saleId: sale.id, amount: 10 })
    ).rejects.toThrow(/voided/i);
  });

  it('deleting a repayment record reopens its amount on the balance', async () => {
    const { store, product } = await seedStore();
    const sale = await sell(store.id, makeCart(product.id), {
      paymentMethod: 'Credit',
      customerName: 'Ada',
    });
    const payment = await api.creditPayments.add(store.id, {
      saleId: sale.id,
      amount: 120,
      method: 'POS/Card',
    });
    expect((await api.sales.list(store.id))[0].amountPaid).toBe(120);

    await api.creditPayments.remove(payment.id);
    expect((await api.sales.list(store.id))[0].amountPaid).toBe(0);
    expect(await api.creditPayments.list(store.id)).toHaveLength(0);
  });
});
