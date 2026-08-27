// The two ways granting Owner Mode can fail on Supabase. Both used to look
// like success (or an unactionable Postgres error) in the UI.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import SuperAdmin from './SuperAdmin';
import { api } from '../lib/backend';
import { loginOrCreateDemo } from '../lib/demo';
import { SUPER_ADMIN_EMAIL } from '../lib/superAdmin';

vi.mock('../lib/backend', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      admin: { ...actual.api.admin, upgradeStoreToOwner: vi.fn() },
    },
  };
});

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  const owner = await loginOrCreateDemo();
  const membership = await api.stores.getMyMembership(owner.id);
  await api.stores.update(membership.store.id, { plan: 'free', isDemo: false });
  await api.auth.signUp({ email: SUPER_ADMIN_EMAIL, password: 'admin123' });
  sessionStorage.setItem('smartstore-super-admin-unlocked', 'true');
  api.admin.upgradeStoreToOwner.mockReset();
});

async function clickUpgrade(user) {
  render(
    <MemoryRouter>
      {/* toasts are how this page reports a refused grant */}
      <Toaster />
      <SuperAdmin />
    </MemoryRouter>
  );
  await user.click(await screen.findByRole('button', { name: /^stores$/i }));
  await user.click(
    await screen.findByRole('button', { name: /upgrade demo supermart to owner mode/i })
  );
  await user.click(await screen.findByRole('button', { name: /upgrade to owner$/i }));
}

describe('granting Owner Mode when the server refuses', () => {
  it('says what to do when the super_admin gate rejects the account', async () => {
    api.admin.upgradeStoreToOwner.mockRejectedValue(
      Object.assign(new Error('Super admin access required'), { code: '42501' })
    );
    await clickUpgrade(userEvent.setup());

    expect(
      await screen.findByText(/app_metadata\.role = "super_admin"/i)
    ).toBeTruthy();
    expect(screen.queryByText(/upgraded to Owner Mode/i)).toBe(null);
  });

  it('does not report success when RLS swallows the write', async () => {
    // What the old inline fallback did: an update that matched zero rows
    // returns no error, so the UI announced a success that never happened.
    api.admin.upgradeStoreToOwner.mockRejectedValue(
      new Error('JSON object requested, multiple (or no) rows returned')
    );
    await clickUpgrade(userEvent.setup());

    expect(
      await screen.findByText(/005_admin_upgrade_owner\.sql/i)
    ).toBeTruthy();
    expect(screen.queryByText(/upgraded to Owner Mode/i)).toBe(null);

    // and the store really is still on the free plan
    const db = JSON.parse(localStorage.getItem('smartstore-db'));
    expect(db.stores[0].plan).not.toBe('owner');
  });
});
