// Owner-side approval queue. A staff member who signs up with a join code
// lands in store_members as 'pending'; the owner must see that request on
// the User Approvals page and be able to approve or reject it — and a
// mistyped code must never strand the request in a store whose owner never
// sees it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import App from '../App';
import { api } from '../lib/backend';
import { loginOrCreateDemo } from '../lib/demo';

vi.mock('../pages/Dashboard', () => ({ default: () => <div>DASHBOARD PAGE</div> }));

const OWNER_PASSWORD = 'Demo1234!';

/** The demo owner, their store, and a pending staff request against it. */
async function seedPendingStaff() {
  const owner = await loginOrCreateDemo();
  const membership = await api.stores.getMyMembership(owner.id);
  const storeId = membership.store.id;
  const joinCode = membership.store.joinCode;

  const staff = await api.auth.signUp({
    email: 'tunde@shop.com',
    password: 'secret1',
  });
  const joined = await api.stores.joinWithCode(staff.id, staff.email, joinCode);
  expect(joined.approvalStatus).toBe('pending');
  await api.auth.signOut();

  const staffBefore = (await api.team.list(storeId)).find(
    (m) => m.userId === staff.id
  );
  expect(staffBefore?.approvalStatus).toBe('pending');

  return { owner, storeId, staff, joinCode };
}

async function signInAs(user, email, password) {
  await user.type(await screen.findByLabelText(/email address/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole('button', { name: /log in/i }));
}

function renderApp(route = '/login') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
}

describe('owner approval queue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows pending members on the User Approvals page and approves them', async () => {
    const { owner, storeId, staff } = await seedPendingStaff();

    const user = userEvent.setup();
    renderApp();
    await signInAs(user, owner.email, OWNER_PASSWORD);

    // Owner lands inside the store, not on a waiting screen.
    expect(await screen.findByText('DASHBOARD PAGE')).toBeTruthy();

    // Open the approvals page from the sidebar.
    await user.click(screen.getByRole('button', { name: /user approvals/i }));

    // The pending staff member is visible with their request.
    expect(await screen.findByText('tunde@shop.com')).toBeTruthy();
    expect(screen.getByText(/awaiting review/i)).toBeTruthy();

    // Approve them — store_members approval_status becomes 'approved'.
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(async () => {
      const member = (await api.team.list(storeId)).find(
        (m) => m.userId === staff.id
      );
      expect(member?.approvalStatus).toBe('approved');
    });
  });

  it('rejecting from the page records the decision in store_members', async () => {
    const { owner, storeId, staff } = await seedPendingStaff();

    const user = userEvent.setup();
    renderApp();
    await signInAs(user, owner.email, OWNER_PASSWORD);
    expect(await screen.findByText('DASHBOARD PAGE')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: /user approvals/i })
    );

    expect(await screen.findByText('tunde@shop.com')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(async () => {
      const member = (await api.team.list(storeId)).find(
        (m) => m.userId === staff.id
      );
      expect(member?.approvalStatus).toBe('rejected');
    });
  });

  it('moves a pending request to the store whose code was typed last', async () => {
    const { storeId: storeA, joinCode: codeA } = await seedPendingStaff();

    // A second store with its own owner and join code.
    const ownerB = await api.auth.signUp({
      email: 'bisi@shop.com',
      password: 'secret1',
    });
    const storeB = await api.stores.create(ownerB.id, ownerB.email, {
      name: "Bisi's Boutique",
      type: 'boutique',
    });

    // The staff member first joins the wrong store, then re-enters the
    // correct code: the request must follow the second code, or Bisi's
    // approvals page stays empty while Tunde waits forever.
    const staff = await api.auth.signIn({
      email: 'tunde@shop.com',
      password: 'secret1',
    });
    await api.stores.joinWithCode(staff.id, staff.email, codeA);
    await api.stores.joinWithCode(staff.id, staff.email, storeB.joinCode);

    const inB = (await api.team.list(storeB.id)).find((m) => m.userId === staff.id);
    expect(inB?.approvalStatus).toBe('pending');

    // The old store's queue no longer holds the request…
    const stillInA = (await api.team.list(storeA)).find((m) => m.userId === staff.id);
    expect(stillInA).toBeUndefined();

    // …and the membership (which AuthContext reads on auth change) points
    // at the right store, still pending.
    const membership = await api.stores.getMyMembership(staff.id);
    expect(membership.store.id).toBe(storeB.id);
    expect(membership.approvalStatus).toBe('pending');
    await api.auth.signOut();
  });
});
