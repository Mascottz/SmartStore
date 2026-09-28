// POS partial-payment & credit checkout: the register collects a customer
// name (and the amount paid now, for Partial) before completing the sale and
// passes them through to the backend so the Credit Book can track the debt.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import POS from './POS';
import { api } from '../lib/backend';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({ state: { products: [], categories: [] } }));

vi.mock('../lib/backend', () => ({
  api: {
    products: { list: vi.fn(async () => state.products) },
    categories: { list: vi.fn(async () => state.categories) },
    sales: { create: vi.fn(async () => ({ id: 'sale-1' })) },
    stores: { update: vi.fn(async () => ({})) },
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
  store: { id: 'store-1', name: 'Demo Supermart', onboarding: { firstSaleCompleted: true } },
  storeName: 'Demo Supermart',
  firstSaleCompleted: true,
};

const milk = {
  id: 'p1',
  storeId: 'store-1',
  name: 'Peak Milk',
  sku: 'pk',
  category: 'Dairy',
  costPrice: 100,
  salePrice: 1000,
  stock: 10,
};

beforeEach(() => {
  state.products = [milk];
  state.categories = [];
  vi.clearAllMocks();
});

async function addMilkToCart(user) {
  const tile = await screen.findByRole('button', { name: /Peak Milk/ });
  await user.click(tile);
}

describe('POS credit payment methods', () => {
  it('offers Partial and Credit alongside the till methods', async () => {
    render(<POS />);
    for (const m of ['Cash', 'Transfer', 'POS/Card', 'Partial', 'Credit']) {
      expect(await screen.findByRole('radio', { name: m })).toBeTruthy();
    }
  });

  it('blocks a partial sale without a customer name and amount', async () => {
    const user = userEvent.setup();
    render(<POS />);
    await addMilkToCart(user);

    await user.click(screen.getByRole('radio', { name: 'Partial' }));
    await user.click(screen.getByRole('button', { name: 'Complete Sale' }));
    expect(api.sales.create).not.toHaveBeenCalled();

    // Name alone is not enough — the part payment amount is required too.
    await user.type(screen.getByLabelText(/Customer name/i), 'Mama Ngozi');
    await user.click(screen.getByRole('button', { name: 'Complete Sale' }));
    expect(api.sales.create).not.toHaveBeenCalled();
  });

  it('completes a partial sale with amount and customer, then resets', async () => {
    const user = userEvent.setup();
    render(<POS />);
    await addMilkToCart(user);

    await user.click(screen.getByRole('radio', { name: 'Partial' }));
    await user.type(screen.getByLabelText(/Customer name/i), 'Mama Ngozi');
    await user.type(screen.getByLabelText(/Amount paid now/i), '400');
    await user.click(screen.getByRole('button', { name: 'Complete Sale' }));

    await waitFor(() => expect(api.sales.create).toHaveBeenCalledTimes(1));
    expect(api.sales.create).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({
        paymentMethod: 'Partial',
        amountPaid: 400,
        customerName: 'Mama Ngozi',
      })
    );
    // The credit fields clear for the next customer.
    expect(screen.getByLabelText(/Customer name/i).value).toBe('');
  });

  it('rejects a part payment that covers the whole bill', async () => {
    const user = userEvent.setup();
    render(<POS />);
    await addMilkToCart(user);

    await user.click(screen.getByRole('radio', { name: 'Partial' }));
    await user.type(screen.getByLabelText(/Customer name/i), 'Mama Ngozi');
    await user.type(screen.getByLabelText(/Amount paid now/i), '1000');
    await user.click(screen.getByRole('button', { name: 'Complete Sale' }));
    expect(api.sales.create).not.toHaveBeenCalled();
  });

  it('sells on credit with only a customer name — no amount collected', async () => {
    const user = userEvent.setup();
    render(<POS />);
    await addMilkToCart(user);

    await user.click(screen.getByRole('radio', { name: 'Credit' }));
    // No "amount paid now" field on full credit.
    expect(screen.queryByLabelText(/Amount paid now/i)).toBeNull();

    await user.type(screen.getByLabelText(/Customer name/i), 'Chidi Okeke');
    await user.click(screen.getByRole('button', { name: 'Complete Sale' }));

    await waitFor(() => expect(api.sales.create).toHaveBeenCalledTimes(1));
    expect(api.sales.create).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({
        paymentMethod: 'Credit',
        amountPaid: 0,
        customerName: 'Chidi Okeke',
      })
    );
  });

  it('hides the credit fields again when a till method is picked', async () => {
    const user = userEvent.setup();
    render(<POS />);
    await addMilkToCart(user);

    await user.click(screen.getByRole('radio', { name: 'Credit' }));
    expect(screen.getByLabelText(/Customer name/i)).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Cash' }));
    expect(screen.queryByLabelText(/Customer name/i)).toBeNull();
  });
});
