// Onboarding's "already has a store" terminal screen.
//
// RootRoute only sends a user to /onboarding when they have no store, so this
// covers the edges that land there anyway: a stale tab or bookmarked link
// where the membership has since loaded, and a backend that rejects store
// creation because the account already owns one. Either way the user must get
// an explicit way into their store rather than a splash that never resolves.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import Onboarding from './Onboarding';
import { api } from '../lib/backend';

const authState = {
  user: { id: 'u1', email: 'ada@shop.com' },
  store: null,
  loading: false,
  refreshMembership: vi.fn(async () => {}),
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/backend', () => ({
  api: {
    stores: {
      create: vi.fn(),
    },
  },
}));

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Onboarding />
    </MemoryRouter>
  );
}

describe('Onboarding — already has a store', () => {
  beforeEach(() => {
    Object.assign(authState, {
      user: { id: 'u1', email: 'ada@shop.com' },
      store: null,
      loading: false,
      refreshMembership: vi.fn(async () => {}),
    });
    api.stores.create.mockReset();
    vi.stubGlobal('location', { href: '' });
  });

  it('shows the screen with a Go to Dashboard button when a store already exists', () => {
    authState.store = { id: 's1', name: "Marta's Mart", joinCode: 'ABC123' };

    renderOnboarding();

    expect(screen.getByRole('heading', { name: /you already have a store/i })).toBeTruthy();
    expect(screen.getByText("Marta's Mart")).toBeTruthy();

    const button = screen.getByRole('button', { name: /go to dashboard/i });
    expect(button).toBeTruthy();

    // The onboarding wizard must not be rendered behind it.
    expect(screen.queryByLabelText(/what is your business called/i)).toBe(null);
  });

  it('sends the user to the root route so RootRoute picks the destination', async () => {
    authState.store = { id: 's1', name: "Marta's Mart" };
    const user = userEvent.setup();

    renderOnboarding();
    await user.click(screen.getByRole('button', { name: /go to dashboard/i }));

    // RootRoute is the single place that decides where an authenticated user
    // lands, so the button goes to '/' rather than straight to /dashboard.
    expect(window.location.href).toBe('/');
  });

  it('shows the screen when the backend rejects creation as a duplicate store', async () => {
    const user = userEvent.setup();
    api.stores.create.mockRejectedValueOnce(
      new Error('One store per account: this user already has a store.')
    );

    renderOnboarding();

    // Walk step 1 → 3 and submit the wizard.
    await user.type(screen.getByLabelText(/what is your business called/i), 'Mama Nkechi');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(await screen.findByRole('heading', { name: /you already have a store/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeTruthy();
  });

  it('still renders the wizard for an account with no store', () => {
    renderOnboarding();

    expect(screen.getByLabelText(/what is your business called/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /you already have a store/i })).toBe(null);
  });
});
