// A flaky connection must not bounce an existing owner into onboarding.
//
// This is the "the dashboard button doesn't work the first time" bug:
// get_my_membership is a network round trip, and on the mobile connections
// this app targets it sometimes fails outright. refreshMembership used to
// treat that exactly like "this account has no store" and wipe the store out
// of context, which is what sends an owner who already has a store back into
// onboarding -- and from there, finishing the wizard again gets rejected as a
// duplicate, which is the "already set up, sign in again" dead end.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider, useAuth } from './AuthContext';
import { api } from '../lib/backend';
import { loginOrCreateDemo } from '../lib/demo';

function Probe() {
  const { store, refreshMembership } = useAuth();
  return (
    <div>
      <div data-testid="store-name">{store ? store.name : 'none'}</div>
      <button onClick={() => refreshMembership()}>refresh</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

async function findStoreName() {
  return (await screen.findByTestId('store-name')).textContent;
}

describe('membership refresh resilience', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('retries a failed membership lookup instead of clearing a known store', async () => {
    await loginOrCreateDemo();

    const real = api.stores.getMyMembership.bind(api.stores);
    let calls = 0;
    vi.spyOn(api.stores, 'getMyMembership').mockImplementation(async (...args) => {
      calls += 1;
      // The first two attempts look like a dropped mobile connection.
      if (calls <= 2) throw new Error('Failed to fetch');
      return real(...args);
    });

    renderProbe();

    await vi.waitFor(
      async () => {
        expect(await findStoreName()).toBe('Demo Supermart');
      },
      { timeout: 5000 }
    );
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('keeps showing a known store through a refresh that fails outright', async () => {
    await loginOrCreateDemo();
    const user = userEvent.setup();

    renderProbe();
    expect(await findStoreName()).toBe('Demo Supermart');

    // Every retry fails this time -- a real outage, not a one-off blip.
    vi.spyOn(api.stores, 'getMyMembership').mockRejectedValue(new Error('Failed to fetch'));

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^refresh$/i }));
      // Let both retry backoffs (400ms + 1200ms) play out.
      await new Promise((r) => setTimeout(r, 2200));
    });

    // Still showing the store the user already had, not bounced to "none"
    // (which is what used to send them to /onboarding).
    expect(screen.getByTestId('store-name').textContent).toBe('Demo Supermart');
  }, 10000);

  it('does not leak one account store into a different account after a failed refresh', async () => {
    await loginOrCreateDemo();

    renderProbe();
    expect(await findStoreName()).toBe('Demo Supermart');

    // A different account signs in on the same (mounted) session -- a shared
    // shop tablet -- and every membership lookup for it fails.
    await api.auth.signOut();
    vi.spyOn(api.stores, 'getMyMembership').mockRejectedValue(new Error('Failed to fetch'));

    await act(async () => {
      await api.auth.signUp({ email: 'newowner@shop.com', password: 'secret1' });
      await new Promise((r) => setTimeout(r, 2200));
    });

    // The new (storeless, and never successfully fetched) account must never
    // show the previous owner's store -- "leave state untouched on failure"
    // must not extend across a change of account.
    expect(screen.getByTestId('store-name').textContent).toBe('none');
  }, 10000);
});
