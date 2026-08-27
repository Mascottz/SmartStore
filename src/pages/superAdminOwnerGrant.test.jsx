// Repro: the real user path — sign in as the super admin, land on the console,
// grant Owner Mode from the Stores tab.
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import App from '../App';
import { api } from '../lib/backend';
import { loginOrCreateDemo } from '../lib/demo';
import { SUPER_ADMIN_EMAIL } from '../lib/superAdmin';

let storeId;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  const owner = await loginOrCreateDemo();
  const membership = await api.stores.getMyMembership(owner.id);
  storeId = membership.store.id;
  await api.stores.update(storeId, { plan: 'free', isDemo: false });
  await api.auth.signUp({ email: SUPER_ADMIN_EMAIL, password: 'admin123' });
  await api.auth.signOut();
});

describe('super admin console access', () => {
  it('signs in, reaches the console and grants Owner Mode', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    );

    await user.type(await screen.findByLabelText(/email address/i), SUPER_ADMIN_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), 'admin123');
    await user.click(screen.getByRole('button', { name: /admin sign in/i }));

    // the route guard must let the super admin through, not hold them on the
    // waiting screen or bounce them to the dashboard
    expect((await screen.findAllByText(/system admin|super admin/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Waiting for approval')).toBe(null);

    await user.click(screen.getByRole('button', { name: /^stores$/i }));
    await user.click(
      await screen.findByRole('button', { name: /upgrade demo supermart to owner mode/i })
    );
    await user.click(await screen.findByRole('button', { name: /upgrade to owner$/i }));

    await waitFor(async () => {
      const db = JSON.parse(localStorage.getItem('smartstore-db'));
      expect(db.stores.find((s) => s.id === storeId).plan).toBe('owner');
    });
  });
});
