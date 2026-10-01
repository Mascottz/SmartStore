// Pharmacy Mode at the register: Rx-flagged medicines gate checkout behind
// a prescription check, tiles show in-date stock (not the raw rollup), and
// cart lines preview the FEFO batches the sale will be dispensed from.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import POS from './POS';
import { api } from '../lib/backend';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({ state: { products: [], categories: [], batches: [] } }));

vi.mock('../lib/backend', () => ({
  api: {
    products: { list: vi.fn(async () => state.products) },
    batches: { list: vi.fn(async () => state.batches) },
    categories: { list: vi.fn(async () => state.categories) },
    team: { list: vi.fn(async () => state.team || []) },
    sales: {
      create: vi.fn(async (_storeId, payload) => ({
        id: 'sale-1',
        items: payload.items,
        total: payload.items.reduce((s, i) => s + i.lineTotal, 0),
      })),
    },
    stores: { update: vi.fn(async () => ({})) },
  },
  subscribe: () => () => {},
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

const authState = {
  storeId: 'store-1',
  user: { id: 'u1', email: 'pharm@healthway.ng' },
  role: 'cashier',
  niche: getNiche('pharmacy'),
  store: { id: 'store-1', name: 'Healthway Pharmacy', onboarding: { firstSaleCompleted: true } },
  storeName: 'Healthway Pharmacy',
  firstSaleCompleted: true,
};

const iso = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const medicine = (name, extra = {}) => ({
  id: name,
  storeId: 'store-1',
  name,
  sku: name.toLowerCase().replace(/\s+/g, '-'),
  category: 'Prescription Drugs',
  costPrice: 100,
  salePrice: 250,
  stock: 30,
  isRx: false,
  ...extra,
});

const batch = (product, overrides = {}) => ({
  id: `${product}-${Math.random().toString(36).slice(2, 7)}`,
  storeId: 'store-1',
  productId: product,
  batchNo: 'B-1',
  expiryDate: iso(200),
  qty: 10,
  costPrice: 100,
  supplier: '',
  status: 'active',
  ...overrides,
});

describe('POS: pharmacy mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.categories = [];
    state.team = [];
  });

  it('caps the cart at in-date stock and says so when batches expired', async () => {
    state.products = [medicine('Cough Syrup')];
    // Rollup says 30 (10 expired + 10 quarantined + 10 good).
    state.batches = [
      batch('Cough Syrup', { qty: 10, expiryDate: iso(-5) }),
      batch('Cough Syrup', { qty: 10, status: 'quarantined' }),
      batch('Cough Syrup', { qty: 10, batchNo: 'GOOD', expiryDate: iso(120) }),
    ];

    render(<POS />);
    await waitFor(() => expect(screen.getByText('Cough Syrup')).toBeTruthy());

    // Tile reports in-date stock, not the rollup.
    expect(screen.getByText('10 in-date')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Cough Syrup/ }));
    // The cart drawer line joins the tile in the DOM once added.
    await waitFor(() =>
      expect(screen.getAllByText('Cough Syrup').length).toBeGreaterThanOrEqual(2)
    );

    // Increase quantity past the in-date cap: the register refuses to go
    // beyond what the good batch can cover.
    const plus = screen.getAllByRole('button', { name: /Increase Cough Syrup quantity/ })[0];
    for (let i = 0; i < 12; i++) {
      await userEvent.click(plus);
    }
    const qtyDisplay = screen.getByLabelText('Cough Syrup quantity');
    expect(qtyDisplay.textContent).toBe('10');
  });

  it('marks a shelf of only expired stock as unbuyable', async () => {
    state.products = [medicine('Old Antibiotic', { stock: 40 })];
    state.batches = [batch('Old Antibiotic', { qty: 40, expiryDate: iso(-30) })];

    render(<POS />);
    await waitFor(() => expect(screen.getByText('Old Antibiotic')).toBeTruthy());

    const tile = screen.getByRole('button', { name: /Old Antibiotic/ });
    expect(tile.disabled).toBe(true);
    expect(screen.getByText('All batches expired')).toBeTruthy();
  });

  it('previews the FEFO batches a cart line will be dispensed from', async () => {
    state.products = [medicine('Paracetamol')];
    state.batches = [
      batch('Paracetamol', { batchNo: 'LATER', qty: 50, expiryDate: iso(300) }),
      batch('Paracetamol', { batchNo: 'SOON', qty: 20, expiryDate: iso(25) }),
    ];

    render(<POS />);
    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /Paracetamol/ }));
    await waitFor(() =>
      expect(
        screen.getAllByText((_, el) =>
          Boolean(el?.textContent?.startsWith('SOON × 1 (exp'))
        ).length
      ).toBeGreaterThan(0)
    );
  });

  it('gates Rx sales behind the prescription check', async () => {
    state.products = [
      medicine('Amoxicillin 500mg', { isRx: true, stock: 20 }),
      medicine('Paracetamol', { isRx: false, stock: 20 }),
    ];
    state.batches = [
      batch('Amoxicillin 500mg', { qty: 20 }),
      batch('Paracetamol', { qty: 20 }),
    ];

    render(<POS />);
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeTruthy());

    // Both medicines carry an Rx badge somewhere in the UI.
    expect(screen.getAllByText('Rx').length).toBeGreaterThanOrEqual(1);

    await userEvent.click(screen.getByRole('button', { name: /Amoxicillin 500mg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Complete Sale' }));

    // The prescription check dialog opens instead of the sale going through.
    const dialog = await screen.findByRole('dialog', { name: 'Prescription check' });
    expect(dialog).toBeTruthy();
    expect(api.sales.create).not.toHaveBeenCalled();

    // Confirming the check completes the sale.
    await userEvent.click(
      screen.getByRole('button', { name: 'Prescription checked - dispense' })
    );
    await waitFor(() => expect(api.sales.create).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Prescription check' })).toBeNull();
    // A plain Rx sale (no controlled lines) records no verifier.
    expect(api.sales.create.mock.calls[0][1].verifiedBy).toBe('');
  });

  it('names the verifying pharmacist for controlled medicines', async () => {
    state.products = [
      medicine('Tramadol 50mg', { isRx: true, isControlled: true, stock: 20 }),
    ];
    state.batches = [batch('Tramadol 50mg', { qty: 20, batchNo: 'TRA-11' })];
    state.team = [
      {
        id: 'm1',
        email: 'chief@healthway.ng',
        role: 'owner',
        isPharmacist: true,
      },
      { id: 'm2', email: 'cashier@healthway.ng', role: 'cashier', isPharmacist: false },
    ];

    render(<POS />);
    await waitFor(() => expect(screen.getByText('Tramadol 50mg')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /Tramadol 50mg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Complete Sale' }));

    // The verification dialog opens with the pharmacist select; the signed-in
    // user is not a flagged pharmacist, so the flagged one is offered.
    const dialog = await screen.findByRole('dialog', { name: 'Prescription check' });
    expect(
      within(dialog).getByLabelText(/Verifying pharmacist/)
    ).toBeTruthy();
    expect(
      within(dialog).getByLabelText(/Verifying pharmacist/).value
    ).toBe('chief@healthway.ng');
    // The non-pharmacist signed-in user is not offered as a verifier option.
    expect(within(dialog).queryByText('cashier@healthway.ng (you)')).toBeNull();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Prescription checked - dispense' })
    );
    await waitFor(() => expect(api.sales.create).toHaveBeenCalledTimes(1));
    const payload = api.sales.create.mock.calls[0][1];
    // The dispensing is recorded against the named pharmacist, and the
    // controlled line travels with the sale for the register.
    expect(payload.verifiedBy).toBe('chief@healthway.ng');
    expect(payload.items[0].isControlled).toBe(true);
  });

  it('completes non-Rx sales with no prescription dialog', async () => {
    state.products = [medicine('Paracetamol', { stock: 20 })];
    state.batches = [batch('Paracetamol', { qty: 20 })];

    render(<POS />);
    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /Paracetamol/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Complete Sale' }));

    await waitFor(() => expect(api.sales.create).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Prescription checked?')).toBeNull();
  });
});
