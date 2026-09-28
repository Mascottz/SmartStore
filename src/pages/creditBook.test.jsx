// Credit Book: the record of partial payments and credit sales. Pins the
// outstanding balances the page derives, customer search, and the
// record-a-repayment flow that moves a debt towards settled.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CreditBook from './CreditBook';
import { api } from '../lib/backend';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({
  state: { sales: [], payments: [], storeId: 'store-1' },
}));

vi.mock('../lib/backend', () => ({
  api: {
    sales: { list: vi.fn(async () => state.sales) },
    creditPayments: {
      list: vi.fn(async () => state.payments),
      add: vi.fn(async (_storeId, p) => ({ id: 'pay-new', ...p })),
      remove: vi.fn(async () => true),
    },
  },
  subscribe: () => () => {},
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

const authState = {
  storeId: 'store-1',
  user: { id: 'u1', email: 'cashier@shop.com' },
  role: 'cashier',
  niche: getNiche('supermarket'),
  store: { id: 'store-1', name: 'Demo Supermart' },
  storeName: 'Demo Supermart',
};

const saleFixture = (over) => ({
  id: 's1',
  storeId: 'store-1',
  receiptNo: 'SM-1',
  paymentMethod: 'Partial',
  cashierEmail: 'cashier@shop.com',
  status: 'completed',
  items: [{ productId: 'p1', name: 'Item A', qty: 1, price: 1000, lineTotal: 1000 }],
  total: 1000,
  amountPaid: 400,
  customerName: 'Mama Ngozi',
  createdAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  state.sales = [
    saleFixture(),
    saleFixture({
      id: 's2',
      receiptNo: 'SM-2',
      paymentMethod: 'Credit',
      total: 500,
      amountPaid: 0,
      customerName: 'Chidi Okeke',
    }),
    // Fully paid cash sale — must not show up in the Credit Book.
    saleFixture({ id: 's3', receiptNo: 'SM-3', paymentMethod: 'Cash', total: 300, amountPaid: 300, customerName: '' }),
  ];
  state.payments = [
    {
      id: 'pay-1',
      storeId: 'store-1',
      saleId: 's1',
      receiptNo: 'SM-1',
      customerName: 'Mama Ngozi',
      amount: 200,
      method: 'Cash',
      note: '',
      receivedBy: 'cashier@shop.com',
      createdAt: new Date().toISOString(),
    },
  ];
  vi.clearAllMocks();
});

describe('Credit Book', () => {
  it('lists only credit sales, with the money still owed', async () => {
    render(<CreditBook />);
    expect(await screen.findByText('Mama Ngozi')).toBeTruthy();
    expect(screen.getByText('Chidi Okeke')).toBeTruthy();
    // The plain cash sale stays out of the book.
    expect(screen.queryByText('SM-3', { exact: false })).toBeNull();
    // Outstanding headline: 600 + 500.
    expect(screen.getAllByText('₦1,100').length).toBeGreaterThan(0);
  });

  it('filters records by customer name', async () => {
    const user = userEvent.setup();
    render(<CreditBook />);
    await screen.findByText('Mama Ngozi');
    await user.type(screen.getByLabelText(/Search credit records/i), 'chidi');
    await waitFor(() => {
      expect(screen.queryByText('Mama Ngozi')).toBeNull();
      expect(screen.getByText('Chidi Okeke')).toBeTruthy();
    });
  });

  it('shows a sale’s repayment history when expanded', async () => {
    const user = userEvent.setup();
    render(<CreditBook />);
    const row = await screen.findByText('Mama Ngozi');
    await user.click(row.closest('button'));
    expect(await screen.findByText(/Repayments \(1\)/)).toBeTruthy();
    // cashiers don't get the delete-control for repayment records
    expect(screen.queryByLabelText(/Delete repayment/i)).toBeNull();
  });

  it('records a repayment against an open debt', async () => {
    const user = userEvent.setup();
    render(<CreditBook />);
    const row = await screen.findByText('Mama Ngozi');
    await user.click(row.closest('button'));
    await user.click(await screen.findByRole('button', { name: /Record payment/i }));

    // Modal prefills the outstanding balance (1000 - 400 = 600).
    const amount = screen.getByLabelText(/Amount received/i);
    expect(amount.value).toBe('600');
    await user.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => expect(api.creditPayments.add).toHaveBeenCalledTimes(1));
    expect(api.creditPayments.add).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({
        saleId: 's1',
        amount: 600,
        method: 'Cash',
        receivedBy: 'cashier@shop.com',
      })
    );
  });

  it('rejects a repayment bigger than the outstanding balance', async () => {
    const user = userEvent.setup();
    render(<CreditBook />);
    const row = await screen.findByText('Mama Ngozi');
    await user.click(row.closest('button'));
    await user.click(await screen.findByRole('button', { name: /Record payment/i }));

    const amount = screen.getByLabelText(/Amount received/i);
    await user.clear(amount);
    await user.type(amount, '999');
    await user.click(screen.getByRole('button', { name: 'Record Payment' }));
    expect(api.creditPayments.add).not.toHaveBeenCalled();
  });
});
