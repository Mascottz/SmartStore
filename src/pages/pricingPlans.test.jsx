// Pricing plans: the Owner upgrade now bills monthly or yearly. These tests
// pin the yearly numbers (two months free), the billing toggle on the card,
// and the plan-specific Paystack reference/amount handed to checkout.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Pricing, {
  OWNER_PRICE_MONTHLY_NAIRA,
  OWNER_PRICE_YEARLY_NAIRA,
  OWNER_YEARLY_SAVINGS_NAIRA,
} from './Pricing';
import { initializePayment } from '../lib/paystack';

vi.mock('../lib/paystack', () => ({
  isPaystackConfigured: () => true,
  initializePayment: vi.fn(async () => ({ reference: 'ref' })),
  // Pass the prefix straight through so the test can read it back verbatim.
  makeReference: (prefix) => `${prefix}-TEST`,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    plan: 'free',
    upgradeToOwner: vi.fn(async () => {}),
    storeIsDemo: false,
    user: { email: 'owner@shop.com' },
  }),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

describe('Owner plan pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prices yearly as two months free versus monthly', () => {
    expect(OWNER_PRICE_MONTHLY_NAIRA).toBe(5000);
    expect(OWNER_PRICE_YEARLY_NAIRA).toBe(50000);
    // 12 monthly payments minus the yearly price is exactly the advertised saving.
    expect(OWNER_YEARLY_SAVINGS_NAIRA).toBe(10000);
    expect(OWNER_PRICE_MONTHLY_NAIRA * 12 - OWNER_PRICE_YEARLY_NAIRA).toBe(
      OWNER_YEARLY_SAVINGS_NAIRA
    );
  });

  it('shows the monthly price by default and the yearly price after toggling', async () => {
    render(<Pricing />);

    // Monthly by default. The price and its period live in separate nodes,
    // so match the owner price paragraph by its full text content.
    expect(screen.getByRole('button', { name: /Pay .*monthly/i })).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === '\u20A65,000/month')).toBeTruthy();

    await userEvent.click(screen.getByRole('radio', { name: /Yearly/i }));

    expect(screen.getByText((_, el) => el?.textContent === '\u20A650,000/year')).toBeTruthy();
    expect(screen.getByText(/Two months free/i)).toBeTruthy();
    // The saving is surfaced on the toggle and in the card copy.
    expect(screen.getAllByText(/\u20A610,000/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Pay .*yearly/i })).toBeTruthy();
  });

  it('starts monthly checkout with the SS-MONTHLY reference and 5,000 amount', async () => {
    render(<Pricing />);

    await userEvent.click(screen.getByRole('button', { name: /Pay .*monthly/i }));

    await waitFor(() => expect(initializePayment).toHaveBeenCalledTimes(1));
    const args = initializePayment.mock.calls[0][0];
    expect(args.amount).toBe(OWNER_PRICE_MONTHLY_NAIRA);
    expect(args.reference).toMatch(/^SS-MONTHLY-/);
  });

  it('starts yearly checkout with the SS-YEARLY reference and 50,000 amount', async () => {
    render(<Pricing />);

    await userEvent.click(screen.getByRole('radio', { name: /Yearly/i }));
    await userEvent.click(screen.getByRole('button', { name: /Pay .*yearly/i }));

    await waitFor(() => expect(initializePayment).toHaveBeenCalledTimes(1));
    const args = initializePayment.mock.calls[0][0];
    expect(args.amount).toBe(OWNER_PRICE_YEARLY_NAIRA);
    expect(args.reference).toMatch(/^SS-YEARLY-/);
  });
});
