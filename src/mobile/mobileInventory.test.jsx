// The monitoring app's Inventory page: cards instead of a squeezed table.
// These tests pin the mobile behaviours that matter on a phone — colour-coded
// stock badges, chip filters that actually filter, tap-to-expand details and
// the add-item bottom sheet.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MobileInventory from './MobileInventory';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({ state: { products: [], categories: [] } }));

vi.mock('../lib/backend', () => ({
  api: {
    products: {
      list: vi.fn(async () => state.products),
      create: vi.fn(async () => ({ id: 'new-1' })),
      update: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({})),
    },
    categories: { list: vi.fn(async () => state.categories) },
    stores: { update: vi.fn(async () => ({})) },
  },
  subscribe: () => () => {},
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    storeId: 'store-1',
    user: { id: 'u1', email: 'owner@shop.com' },
    role: 'owner',
    niche: getNiche('supermarket'),
    store: { id: 'store-1', name: 'Demo Supermart', onboarding: { firstProductAdded: true } },
  }),
}));

const product = (name, stock, extra = {}) => ({
  id: name,
  storeId: 'store-1',
  name,
  sku: name.toLowerCase().replace(/\s+/g, '-'),
  category: 'Beverages',
  costPrice: 100,
  salePrice: 250,
  stock,
  ...extra,
});

beforeEach(() => {
  state.products = [
    product('Peak Milk 400g', 120),
    product('Gala Sausage Roll', 30), // low
    product('Eva Water 75cl', 0), // out
    product('Titus Sardine', 75, { category: 'Food Cupboard & Dry Foods' }),
  ];
  state.categories = [
    { id: 'c1', name: 'Beverages' },
    { id: 'c2', name: 'Food Cupboard & Dry Foods' },
  ];
});

describe('MobileInventory (monitoring app)', () => {
  it('renders one card per item with colour-coded stock badges', async () => {
    render(<MobileInventory />);

    expect(await screen.findByText('Peak Milk 400g')).toBeTruthy();
    expect(screen.getByText('Gala Sausage Roll')).toBeTruthy();
    expect(screen.getByText('Eva Water 75cl')).toBeTruthy();

    // Healthy stock reads as "N in stock", low as "N left", zero as out.
    expect(screen.getByText('120 in stock')).toBeTruthy();
    expect(screen.getByText('30 left')).toBeTruthy();
    // (the badge is a span; the "Out of stock" filter chip is a button)
    expect(screen.getByText('Out of stock', { selector: 'span' })).toBeTruthy();

    // The shelf-worth summary is present for the whole catalogue.
    expect(screen.getByText('Stock at cost')).toBeTruthy();
    expect(screen.getByText('Retail value')).toBeTruthy();
  });

  it('filters by the Low stock chip and by search', async () => {
    render(<MobileInventory />);
    await screen.findByText('Peak Milk 400g');

    fireEvent.click(screen.getByRole('button', { name: 'Low stock' }));
    await waitFor(() => {
      expect(screen.queryByText('Peak Milk 400g')).toBeNull();
      expect(screen.getByText('Gala Sausage Roll')).toBeTruthy();
      expect(screen.getByText('Eva Water 75cl')).toBeTruthy();
    });

    // Out of stock chip narrows further.
    fireEvent.click(screen.getByRole('button', { name: 'Out of stock' }));
    await waitFor(() => expect(screen.queryByText('Gala Sausage Roll')).toBeNull());
    expect(screen.getByText('Eva Water 75cl')).toBeTruthy();

    // Back to all, then search by name.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(screen.getByText('Peak Milk 400g')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/search products/i), {
      target: { value: 'peak' },
    });
    await waitFor(() => {
      expect(screen.getByText('Peak Milk 400g')).toBeTruthy();
      expect(screen.queryByText('Titus Sardine')).toBeNull();
    });
  });

  it('expands a card into details with edit and delete actions', async () => {
    render(<MobileInventory />);
    const card = await screen.findByText('Peak Milk 400g');
    fireEvent.click(card);

    expect(await screen.findByText('Cost price')).toBeTruthy();
    expect(screen.getByText('Margin / unit')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Edit$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
  });

  it('adds an item through the bottom sheet', async () => {
    const user = userEvent.setup();
    render(<MobileInventory />);
    await screen.findByText('Peak Milk 400g');

    await user.click(screen.getByRole('button', { name: /add product/i }));

    const sheet = await screen.findByRole('dialog', { name: /add product/i });
    expect(sheet).toBeTruthy();

    await user.type(within(sheet).getByLabelText(/product name/i), 'Milo Sachet');
    await user.type(within(sheet).getByLabelText(/selling price/i), '150');
    await user.click(within(sheet).getByRole('button', { name: /add product$/i }));

    // The create call went through with the typed payload.
    const { api } = await import('../lib/backend');
    await waitFor(() => {
      expect(api.products.create).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ name: 'Milo Sachet', salePrice: 150 })
      );
    });
  });
});
