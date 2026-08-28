// POS browsing: category pills, the paged grid and the result-count line.
//
// The register used to render every product the store owns in one grid, which
// is fine for ten SKUs and unusable for a supermarket. These tests pin the
// replacement: a pill per category the store actually sells, a first batch of
// 48 tiles with "Show more" for the rest, and a filtered/total counter that
// follows whichever filters are active.
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
  // useStoreData resubscribes on mount; no change events in these tests.
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

const product = (name, category, extra = {}) => ({
  id: name,
  storeId: 'store-1',
  name,
  sku: name.toLowerCase().replace(/\s+/g, '-'),
  category,
  costPrice: 100,
  salePrice: 250,
  stock: 10,
  ...extra,
});

function renderPos() {
  return render(<POS />);
}

/** The category pills live in their own group so the page's other buttons
 *  (scanner, shortcuts, cart controls) never end up in the assertions. */
const pills = () =>
  screen.getAllByRole('button').filter((b) => b.closest('[aria-label*="by category"]'));

describe('POS — category filters', () => {
  beforeEach(() => {
    state.products = [
      product('Peak Milk 400g', 'Beverages'),
      product('Eva Water 75cl', 'Beverages'),
      product('Indomie Chicken 70g', 'Food Cupboard'),
      product('Dettol Soap 110g', 'Toiletries'),
      product('Mystery tin', ''),
    ];
    state.categories = [
      { id: 'c1', name: 'Beverages' },
      { id: 'c2', name: 'Food Cupboard' },
      { id: 'c3', name: 'Toiletries' },
      { id: 'c4', name: 'Empty Category' },
    ];
  });

  it('builds one pill per category the store sells, plus All', async () => {
    renderPos();
    await waitFor(() => expect(screen.getByText('Peak Milk 400g')).toBeTruthy());

    const labels = pills().map((p) => p.textContent);
    expect(labels.some((l) => l.startsWith('All'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Beverages'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Toiletries'))).toBe(true);
    // Products with no category land in "General", which gets its own pill…
    expect(labels.some((l) => l.startsWith('General'))).toBe(true);
    // …while a store category nobody sells yet gets none.
    expect(labels.some((l) => l.startsWith('Empty Category'))).toBe(false);
  });

  it('filters the grid to the selected category and counts it', async () => {
    renderPos();
    await waitFor(() => expect(screen.getByText('Peak Milk 400g')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /^Beverages/ }));

    expect(screen.getByText('Peak Milk 400g')).toBeTruthy();
    expect(screen.getByText('Eva Water 75cl')).toBeTruthy();
    expect(screen.queryByText('Dettol Soap 110g')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('2 / 5 products in Beverages');
  });

  it('combines the category tab with the search box', async () => {
    renderPos();
    await waitFor(() => expect(screen.getByText('Peak Milk 400g')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /^Beverages/ }));
    await userEvent.type(screen.getByLabelText(/search products/i), 'water');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('1 / 5 products in Beverages')
    );

    expect(screen.getByText('Eva Water 75cl')).toBeTruthy();
    expect(screen.queryByText('Peak Milk 400g')).toBeNull();

    // Nothing matches inside this category — the message says so, and the
    // clear-filters shortcut gets the store back.
    await userEvent.clear(screen.getByLabelText(/search products/i));
    await userEvent.type(screen.getByLabelText(/search products/i), 'rice');
    expect(
      await screen.findByText(/No products found for "rice" in Beverages/)
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    // The search box is debounced, so the grid catches up a beat later.
    expect(await screen.findByText('Dettol Soap 110g')).toBeTruthy();
  });
});

describe('POS — pagination', () => {
  beforeEach(() => {
    state.products = Array.from({ length: 60 }, (_, i) =>
      product(`Item ${String(i + 1).padStart(2, '0')}`, i % 2 ? 'Beverages' : 'Snacks')
    );
    state.categories = [];
  });

  it('renders 48 tiles and offers the rest behind Show more', async () => {
    renderPos();
    await waitFor(() => expect(screen.getByText('Item 01')).toBeTruthy());

    expect(screen.getByText('Item 48')).toBeTruthy();
    expect(screen.queryByText('Item 49')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('60 / 60 products · 48 shown');

    await userEvent.click(screen.getByRole('button', { name: /show more/i }));

    expect(await screen.findByText('Item 60')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('60 / 60 products');
  });

  it('resets the batch when the filters change', async () => {
    renderPos();
    await screen.findByText('Item 48');
    await userEvent.click(screen.getByRole('button', { name: /show more/i }));
    await screen.findByText('Item 60');

    await userEvent.click(screen.getByRole('button', { name: /^Snacks/ }));

    // 30 matches in the category, all inside the first 48-item batch.
    expect(screen.getByRole('status').textContent).toBe('30 / 60 products in Snacks');
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();

    // And a category whose tiles exceed one batch starts over at 48.
    await userEvent.click(screen.getByRole('button', { name: /^All/ }));
    await userEvent.click(screen.getByRole('button', { name: /show more/i }));
    await screen.findByText('Item 60');
    await userEvent.click(screen.getByRole('button', { name: /^Beverages/ }));
    expect(screen.getByText('Item 30')).toBeTruthy();
    expect(screen.queryByText('Item 31')).toBeNull();
  });

  it('hides the pills and the counter for an empty store', async () => {
    state.products = [];
    renderPos();
    await waitFor(() => expect(api.products.list).toHaveBeenCalled());

    expect(pills()).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.getByText(/No products yet\. Add some from Inventory\./)
    ).toBeTruthy();
  });
});
