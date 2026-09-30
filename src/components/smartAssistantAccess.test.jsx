// StoreSense is an Owner Mode feature.
//
// The gate is the store's plan, not the staff role: a subscribed store gets
// the assistant for everyone on the team, a Shop Mode (free) store gets a
// locked prompt that routes to the upgrade, and a visitor without a store
// gets nothing at all. The demo store behaves as a subscriber so the public
// demo keeps the co-pilot.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import SmartAssistant from './SmartAssistant';
import { canUseAssistant } from '../lib/assistant';

const { auth } = vi.hoisted(() => ({ auth: { value: {} } }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.value }));

// The assistant's live-data hooks are not what these tests are about; the
// point is whether it mounts at all.
vi.mock('../hooks/useStoreData', () => ({
  useStoreData: () => ({ data: [], loading: false, reload: () => {} }),
}));

vi.mock('../lib/backend', () => ({
  api: {
    kind: 'local',
    sales: { list: vi.fn(async () => []) },
    products: { list: vi.fn(async () => []) },
    expenses: { list: vi.fn(async () => []) },
    creditPayments: { list: vi.fn(async () => []) },
  },
  subscribe: () => () => {},
}));

const signedIn = (overrides = {}) => ({
  storeId: 'store-1',
  storeName: 'Ada Stores',
  role: 'owner',
  plan: 'free',
  storeIsDemo: false,
  niche: { label: 'Supermarket', trackStock: true },
  ...overrides,
});

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderAssistant(at = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <SmartAssistant />
              <CurrentPath />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const openLauncher = async (user, name) =>
  user.click(screen.getByRole('button', { name }));

beforeEach(() => {
  auth.value = signedIn();
});

describe('canUseAssistant', () => {
  it('allows Owner Mode stores and demo stores, and blocks Shop Mode', () => {
    expect(canUseAssistant({ plan: 'owner' })).toBe(true);
    expect(canUseAssistant({ plan: 'free', storeIsDemo: true })).toBe(true);
    expect(canUseAssistant({ plan: 'free' })).toBe(false);
    expect(canUseAssistant({})).toBe(false);
    expect(canUseAssistant()).toBe(false);
  });
});

describe('StoreSense access', () => {
  it('gives a free (Shop Mode) store the locked prompt, not the assistant', async () => {
    const user = userEvent.setup();
    renderAssistant();

    // No chat: the panel that talks to the AI never mounts.
    expect(screen.queryByLabelText(/ask storesense/i)).toBeNull();
    expect(screen.queryByLabelText('StoreSense assistant')).toBeNull();

    await openLauncher(user, /storesense, an owner mode feature/i);

    expect(screen.getByLabelText('StoreSense is an Owner Mode feature')).toBeTruthy();
    expect(screen.getByText(/owner mode feature/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /upgrade to owner mode/i })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/ask storesense about your store/i)).toBeNull();
  });

  it('sends a free store to pricing from the locked prompt', async () => {
    const user = userEvent.setup();
    renderAssistant();

    await openLauncher(user, /storesense, an owner mode feature/i);
    await user.click(screen.getByRole('button', { name: /upgrade to owner mode/i }));

    expect(screen.getByTestId('path').textContent).toBe('/pricing');
  });

  it('keeps the monitoring app on its own pricing route', async () => {
    auth.value = signedIn({ plan: 'free' });
    const user = userEvent.setup();
    renderAssistant('/m/inventory');

    await openLauncher(user, /storesense, an owner mode feature/i);
    await user.click(screen.getByRole('button', { name: /upgrade to owner mode/i }));

    expect(screen.getByTestId('path').textContent).toBe('/m/pricing');
  });

  it('gives an Owner Mode store the real assistant', async () => {
    auth.value = signedIn({ plan: 'owner' });
    const user = userEvent.setup();
    renderAssistant();

    expect(screen.queryByRole('button', { name: /upgrade to owner mode/i })).toBeNull();

    await openLauncher(user, /open storesense assistant/i);

    expect(screen.getByLabelText('StoreSense assistant')).toBeTruthy();
    expect(screen.getByPlaceholderText(/ask storesense about your store/i)).toBeTruthy();
  });

  it('keeps the assistant for staff roles once the store is subscribed', async () => {
    auth.value = signedIn({ plan: 'owner', role: 'cashier' });
    const user = userEvent.setup();
    renderAssistant('/pos');

    await openLauncher(user, /open storesense assistant/i);

    expect(screen.getByPlaceholderText(/ask storesense about your store/i)).toBeTruthy();
  });

  it('keeps the assistant in the demo store', async () => {
    auth.value = signedIn({ plan: 'free', storeIsDemo: true });
    const user = userEvent.setup();
    renderAssistant();

    await openLauncher(user, /open storesense assistant/i);

    expect(screen.getByPlaceholderText(/ask storesense about your store/i)).toBeTruthy();
  });

  it('shows nothing at all without a store', () => {
    auth.value = signedIn({ storeId: null, plan: 'owner' });
    const { container } = renderAssistant();

    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
