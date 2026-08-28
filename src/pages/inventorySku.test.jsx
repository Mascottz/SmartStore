// Auto-SKU on save: a blank code field in the Add modal must not stay blank —
// the product goes in with a readable code built from its own name
// ("Peak Milk 400g" → "PEA-MIL-400G-XXXX"). A code the cashier typed is kept
// exactly as typed, and the generated one never matches a SKU the store
// already uses.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Inventory from './Inventory';
import { api } from '../lib/backend';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({ state: { products: [] } }));

vi.mock('../lib/backend', () => ({
  api: {
    products: {
      list: vi.fn(async () => state.products),
      create: vi.fn(async (storeId, data) => ({ id: 'new-1', storeId, ...data })),
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

const authState = {
  storeId: 'store-1',
  niche: getNiche('supermarket'),
  store: { id: 'store-1', name: 'Demo Supermart', onboarding: {} },
};

/**
 * Fill the Add-Product modal just enough to satisfy `handleSave` and return
 * the SKU that was sent to the backend. `fields` maps input label → value; a
 * value of "" means "leave the field blank".
 */
async function saveProduct(fields) {
  render(<Inventory />);
  // The header's Add Product button (there is no modal yet, so it is unique).
  await userEvent.click(await screen.findByRole('button', { name: /add product/i }));

  const dialog = screen.getByRole('dialog');
  for (const [label, value] of Object.entries(fields)) {
    if (value === '') continue; // leave the field untouched
    // The SKU label also carries a HelpTip button whose accessible name ends
    // in the same words — `selector` keeps the query on the input itself.
    const input = screen.getByLabelText(label, { selector: 'input' });
    await userEvent.type(input, value);
  }

  // The header button is still in the tree behind the modal — pick the one
  // that lives inside the dialog.
  const save = screen
    .getAllByRole('button', { name: /^Add Product$/ })
    .find((b) => b.closest('[aria-modal="true"]'));
  await userEvent.click(save);

  await waitFor(() => expect(api.products.create).toHaveBeenCalled());
  return api.products.create.mock.calls[0][1].sku;
}

describe('Inventory — auto-generated SKU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.products = [];
  });

  it('builds a code from the name when the field is left blank', async () => {
    const sku = await saveProduct({
      'Product name': 'Peak Milk 400g',
      'Selling price': '2800',
      'SKU / Barcode': '',
    });

    expect(sku).toMatch(/^PEA-MIL-400G-[0-9A-F]{4}$/);
  });

  it('keeps the SKU the cashier typed', async () => {
    const sku = await saveProduct({
      'Product name': 'Peak Milk 400g',
      'Selling price': '2800',
      'SKU / Barcode': 'PK-400',
    });

    expect(sku).toBe('PK-400');
  });

  it('does not hand out a code another product already has', async () => {
    state.products = [
      {
        id: 'p1',
        storeId: 'store-1',
        name: 'Peak Milk 400g (spare)',
        sku: 'PEA-MIL-400G-0000',
        category: 'Beverages',
        costPrice: 100,
        salePrice: 150,
        stock: 1,
      },
    ];

    const sku = await saveProduct({
      'Product name': 'Peak Milk 400g',
      'Selling price': '2800',
      'SKU / Barcode': '',
    });

    expect(sku).toMatch(/^PEA-MIL-400G-[0-9A-F]{4}$/);
    expect(sku).not.toBe('PEA-MIL-400G-0000');
  });
});
