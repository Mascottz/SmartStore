// The two-way owner app, exercised through the real App and the real
// localStorage backend (demo mode):
//
//   - a yearly Owner Mode subscriber on a PHONE lands in the monitoring app,
//     and cannot reach the POS register even by typing its URL;
//   - the header toggle switches them into Transactional mode (the choice is
//     remembered on the device);
//   - the sidebar switch brings them back to monitoring;
//   - a FREE-plan owner is untouched: the standard app, even on a phone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import App from '../App';
import { api } from '../lib/backend';

vi.mock('../pages/POS', () => ({ default: () => <div>POS REGISTER PAGE</div> }));
vi.mock('../pages/Dashboard', () => ({ default: () => <div>DASHBOARD PAGE</div> }));
vi.mock('../pages/Onboarding', () => ({ default: () => <div>ONBOARDING PAGE</div> }));

const DEMO_EMAIL = 'demo@smartstoreng.com';
const DEMO_PASSWORD = 'Demo1234!';

/** Pretend the app is open on a phone (or a desktop when mobile=false). */
function pretendDevice(mobile) {
  window.matchMedia = (query) => ({
    matches: mobile && query.includes('767'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

function renderApp(at = '/login') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <App />
    </MemoryRouter>
  );
}

async function signInAs(user, email, password) {
  await user.type(await screen.findByLabelText(/email address/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole('button', { name: /log in/i }));
}

/** Seed the demo store (an Owner Mode, yearly, demo subscriber) and sign out. */
async function seedDemoSubscriber() {
  localStorage.clear();
  const { loginOrCreateDemo } = await import('../lib/demo');
  const owner = await loginOrCreateDemo();
  const membership = await api.stores.getMyMembership(owner.id);
  expect(membership.store.plan).toBe('owner');
  await api.auth.signOut();
}

describe('two-way owner modes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('opens the monitoring app for a phone, and the POS URL redirects back', async () => {
    pretendDevice(true);
    await seedDemoSubscriber();
    const user = userEvent.setup();
    renderApp();

    await signInAs(user, DEMO_EMAIL, DEMO_PASSWORD);

    // The monitoring shell, not the standard app.
    expect(await screen.findByText(/Owner · Monitoring/i)).toBeTruthy();
    expect(screen.queryByText('DASHBOARD PAGE')).toBeNull();

    // Typing the register's URL must not reach the register.
    renderApp('/pos');
    expect(await screen.findByText(/Owner · Monitoring/i)).toBeTruthy();
    expect(screen.queryByText('POS REGISTER PAGE')).toBeNull();
  }, 20000);

  it('switches to Transactional from the header, remembers it, and back from the sidebar', async () => {
    pretendDevice(true);
    await seedDemoSubscriber();
    const user = userEvent.setup();
    renderApp();

    await signInAs(user, DEMO_EMAIL, DEMO_PASSWORD);
    expect(await screen.findByText(/Owner · Monitoring/i)).toBeTruthy();

    // Header switch → the full app.
    await user.click(screen.getByRole('button', { name: /switch to transactional mode/i }));
    expect(await screen.findByText('DASHBOARD PAGE')).toBeTruthy();

    // The manual choice survives a fresh open of the app…
    renderApp('/');
    expect(await screen.findByText('DASHBOARD PAGE')).toBeTruthy();

    // …and the sidebar switch returns to monitoring.
    const monitoringSwitch = await screen.findByRole('button', { name: /^Monitoring$/ });
    await user.click(monitoringSwitch);
    expect(await screen.findByText(/Owner · Monitoring/i)).toBeTruthy();
  }, 20000);

  it('leaves a free-plan owner on the standard app, even on a phone', async () => {
    pretendDevice(true);

    // Seed a free (Shop Mode) store owner.
    localStorage.clear();
    const owner = await api.auth.signUp({ email: 'free@shop.com', password: 'secret1' });
    await api.stores.create(owner.id, owner.email, {
      name: 'Free Shop',
      type: 'supermarket',
      categories: [],
    });
    await api.auth.signOut();

    const user = userEvent.setup();
    renderApp();
    await signInAs(user, 'free@shop.com', 'secret1');

    // Shop Mode: the app exactly as it has always been.
    expect(await screen.findByText('DASHBOARD PAGE')).toBeTruthy();
    expect(screen.queryByText(/Owner · Monitoring/i)).toBeNull();
  }, 20000);
});
