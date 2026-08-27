// Staff join-on-login flow, exercised through the real components and the
// real localStorage backend (demo mode).
//
// The key scenario: a staff member's account exists and a join code is stored
// in localStorage (e.g. the signup was interrupted between account creation
// and the join request, or they queued it on a shared tablet). The next time
// that email signs in, the app must send the join request by itself.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import App from '../App';
import { api } from '../lib/backend';
import { saveJoinRequest, JOIN_REQUEST_KEY } from '../lib/joinRequest';
import { loginOrCreateDemo } from '../lib/demo';

// The pages this flow can reach; only the route match matters.
vi.mock('../pages/POS', () => ({ default: () => <div>POS REGISTER PAGE</div> }));
vi.mock('../pages/Dashboard', () => ({ default: () => <div>DASHBOARD PAGE</div> }));
vi.mock('../pages/Onboarding', () => ({ default: () => <div>ONBOARDING PAGE</div> }));

/** Seed a store with a join code, signed out again. */
async function seedStore() {
  localStorage.clear();
  const owner = await loginOrCreateDemo();
  const membership = await api.stores.getMyMembership(owner.id);
  await api.auth.signOut();
  return {
    joinCode: membership.store.joinCode,
    storeId: membership.store.id,
    ownerEmail: owner.email,
  };
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>
  );
}

async function signInAs(user, email, password) {
  await user.type(await screen.findByLabelText(/email address/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole('button', { name: /log in/i }));
}

describe('staff join-on-login flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('re-sends a stored join code automatically on the next sign-in', async () => {
    const { joinCode, storeId } = await seedStore();

    // Account exists, but the join request never made it out (interrupted
    // signup, dropped request, closed tab) — only the code survived.
    const staff = await api.auth.signUp({ email: 'tunde@shop.com', password: 'secret1' });
    saveJoinRequest({ code: joinCode, email: 'tunde@shop.com' });
    await api.auth.signOut();
    expect(localStorage.getItem(JOIN_REQUEST_KEY)).toBeTruthy();

    const user = userEvent.setup();
    renderApp();
    await signInAs(user, 'tunde@shop.com', 'secret1');

    // The waiting screen shows up with the code that was used.
    expect(await screen.findByText('Approval pending')).toBeTruthy();
    expect(screen.getByText(joinCode)).toBeTruthy();

    // And the request really reached the store as pending.
    await waitFor(async () => {
      const members = await api.team.list(storeId);
      expect(
        members.some((m) => m.userId === staff.id && m.approvalStatus === 'pending')
      ).toBe(true);
    });
  });

  it('walks a newly signed-up staff member to the waiting screen, then in on approval', async () => {
    const { joinCode, storeId } = await seedStore();

    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('tab', { name: /sign up/i }));
    await user.click(screen.getByRole('radio', { name: /joining a store/i }));
    await user.type(screen.getByLabelText(/email address/i), 'ada@shop.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret1');
    await user.type(screen.getByLabelText(/store join code/i), joinCode);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // 1. waiting screen, with the code that was used
    expect(await screen.findByText('Approval pending')).toBeTruthy();
    expect(screen.getByText(joinCode)).toBeTruthy();

    // 2. the request really reached the store as pending
    const staff = await api.auth.getUser();
    await waitFor(async () => {
      const membership = await api.stores.getMyMembership(staff.id);
      expect(membership?.approvalStatus).toBe('pending');
    });

    // 3. owner approves from their own session
    const members = await api.team.list(storeId);
    const staffMember = members.find((m) => m.userId === staff.id);
    await api.team.updateApproval(staffMember.id, 'approved');

    // 4. staff land inside the store (and the stored code is cleaned up)
    expect(await screen.findByText('DASHBOARD PAGE')).toBeTruthy();
    expect(localStorage.getItem(JOIN_REQUEST_KEY)).toBe(null);
  });

  it('does not trap a new owner behind someone else\'s stored join code', async () => {
    const { joinCode } = await seedStore();
    saveJoinRequest({ code: joinCode, email: 'someone-else@shop.com' });

    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('tab', { name: /sign up/i }));
    await user.click(screen.getByRole('radio', { name: /i own a business/i }));
    await user.type(screen.getByLabelText(/email address/i), 'owner2@shop.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('ONBOARDING PAGE')).toBeTruthy();
    // the other person's queued code is untouched
    expect(JSON.parse(localStorage.getItem(JOIN_REQUEST_KEY)).email).toBe(
      'someone-else@shop.com'
    );
  });

  it('keeps a wrong code on the waiting screen with a way out, not in onboarding', async () => {
    await seedStore();

    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('tab', { name: /sign up/i }));
    await user.click(screen.getByRole('radio', { name: /joining a store/i }));
    await user.type(screen.getByLabelText(/email address/i), 'grace@shop.com');
    await user.type(screen.getByLabelText(/^password/i), 'secret1');
    await user.type(screen.getByLabelText(/store join code/i), 'ZZZ999');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Approval pending')).toBeTruthy();
    expect(screen.getByText('ZZZ999')).toBeTruthy();
    expect(screen.queryByText('ONBOARDING PAGE')).toBe(null);

    // they are offered a way out rather than being stuck
    expect(screen.getByText(/use a different one/i)).toBeTruthy();
    expect(screen.getByText(/set up your own business/i)).toBeTruthy();
  });
});
