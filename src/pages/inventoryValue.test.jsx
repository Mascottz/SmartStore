// Inventory worth summary: cost value, retail value, potential profit + margin.
//
// The page used to squeeze one number ("Stock value") into the subtitle, and it
// only ever showed what the stock *cost*. Owners want the other half too — what
// it is worth at the till, and the profit sitting on the shelves. These tests
// pin all three cards, and the fact that the summary describes the whole
// catalogue rather than whatever the search box happens to be filtering.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Inventory from './Inventory';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({ state: { products: [] } }));

vi.mock('../lib/backend', () => ({
  api: {
    products: {
      list: vi.fn(async () => state.products),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
    },
    categories: { list: vi.fn(async () => []) },
    stores: { update: vi.fn(async () => ({})) },
  },
  subscribe: () => () => {},
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

const supermarket = getNiche('supermarket');
const authState = {
  storeId: 'store-1',
  niche: supermarket,
  store: { id: 'store-1', name: 'Demo Supermart', onboarding: {} },
};

const item = (name, category, costPrice, salePrice, stock) => ({
  id: name,
  storeId: 'store-1',
  name,
  sku: name.slice(0, 3).toUpperCase(),
  category,
  costPrice,
  salePrice,
  stock,
});

const twoLines = () => [
  // 10 × ₦100 cost / 10 × ₦150 retail  →  ₦1,000 / ₦1,500
  //  5 × ₦200 cost /  5 × ₦260 retail   →  ₦1,000 / ₦1,300
  //  totals: cost ₦2,000 · retail ₦2,800 · profit ₦800 · 28.6% margin
  item('Peak Milk 400g', 'Beverages', 100, 150, 10),
  item('Ariel Detergent 900g', 'Household', 200, 260, 5),
];

const summary = () => screen.getByRole('region', { name: /inventory worth/i });

describe('Inventory — worth summary', () => {
  beforeEach(() => {
    authState.niche = supermarket;
    state.products = twoLines();
  });

  it('summarises cost value, retail value and potential profit with margin', async () => {
    render(<Inventory />);

    const cards = await screen.findByRole('region', { name: /inventory worth/i });
    const text = cards.textContent;

    expect(text).toContain('Stock at cost');
    expect(text).toContain('₦2,000');
    expect(text).toContain('Retail value');
    expect(text).toContain('₦2,800');
    expect(text).toContain('Potential profit');
    expect(text).toContain('₦800');
    expect(text).toContain('28.6% margin');
    expect(text).toContain('15 units on hand');
  });

  it('counts the whole catalogue, not the filtered table', async () => {
    render(<Inventory />);
    await screen.findByRole('region', { name: /inventory worth/i });

    await userEvent.type(screen.getByLabelText(/search products/i), 'Peak');

    // the search box is debounced; wait for the table to drop to one line
    await waitFor(() =>
      expect(screen.queryAllByText('Ariel Detergent 900g')).toHaveLength(0)
    );
    expect(screen.getByText('Peak Milk 400g')).toBeTruthy();

    // …while the money summary still covers both lines.
    expect(summary().textContent).toContain('₦2,800');
    expect(summary().textContent).toContain('₦2,000');
  });

  it('flags stock worth less than it cost', async () => {
    // Retail below cost on the only line: ₦1,200 cost, ₦900 retail, -₦300
    // and a -33.3% margin.
    state.products = [item('Clearance bag', 'General', 120, 90, 10)];
    render(<Inventory />);

    const cards = await screen.findByRole('region', { name: /inventory worth/i });
    expect(cards.textContent).toContain('-₦300');
    expect(cards.textContent).toContain('-33.3% margin');
    expect(cards.textContent).toContain('Stock is priced below cost');
  });

  it('stays out of the way for niches that do not track stock', async () => {
    authState.niche = getNiche('salon');
    render(<Inventory />);

    // The services catalogue is still listed, there is just nothing on the
    // shelves to value.
    expect(await screen.findAllByText('Peak Milk 400g')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: /inventory worth/i })).toBeNull();
  });

  it('renders nothing for an empty store', async () => {
    state.products = [];
    render(<Inventory />);

    expect(await screen.findByText(/No products yet/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: /inventory worth/i })).toBeNull();
  });
});
