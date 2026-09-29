// src/App.test.jsx
// Launch routing: what a fresh open of the site lands on.
//
// The rules under test:
//   - A fresh open in a normal browser tab ALWAYS shows the landing page,
//     even for visitors with a saved session (with or without a store).
//   - An installed-PWA launch never shows the marketing page: it opens on
//     /login first (never /onboarding), or straight to the dashboard for a
//     signed-in owner whose store is ready.
//   - In-app navigations to '/' (e.g. right after a login) keep the app
//     routing: onboarding for an account without a store, dashboard beyond.
//
// MemoryRouter reports 'POP' for its initial entry, which is exactly how
// react-router sees a fresh page open, and the jsdom matchMedia stub (from
// src/test/setup.js) reports no display mode, i.e. a plain browser tab.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import App from './App';
import { api } from './lib/backend';
import { loginOrCreateDemo } from './lib/demo';

// Only the route match matters here; keep the heavy pages cheap.
vi.mock('./pages/Landing', () => ({ default: () => <div>LANDING PAGE</div> }));
vi.mock('./pages/Dashboard', () => ({ default: () => <div>DASHBOARD PAGE</div> }));
vi.mock('./pages/Onboarding', () => ({ default: () => <div>ONBOARDING PAGE</div> }));
vi.mock('./pages/POS', () => ({ default: () => <div>POS REGISTER PAGE</div> }));

function renderAppAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

/** Pretend the app was launched as an installed PWA (standalone display mode). */
function stubInstalledDisplayMode() {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: /display-mode:\s*(standalone|minimal-ui|window-controls-overlay)/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  return () => {
    window.matchMedia = original;
  };
}

describe('launch routing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('in a browser tab', () => {
    it('shows the landing page on a fresh open, even with a saved session and a store', async () => {
      // A returning owner: session + store already exist on this device.
      await loginOrCreateDemo();

      renderAppAt('/');

      expect(await screen.findByText('LANDING PAGE')).toBeTruthy();
      expect(screen.queryByText('DASHBOARD PAGE')).toBe(null);
    });

    it('shows the landing page (not onboarding) for a signed-in account without a store', async () => {
      // Signed in, but the business setup was never finished.
      await api.auth.signUp({ email: 'halfway@shop.com', password: 'secret1' });

      renderAppAt('/');

      expect(await screen.findByText('LANDING PAGE')).toBeTruthy();
      expect(screen.queryByText('ONBOARDING PAGE')).toBe(null);
      expect(screen.queryByText('DASHBOARD PAGE')).toBe(null);
    });

    it('still routes into the app when navigation happens after a login', async () => {
      await api.auth.signUp({ email: 'owner@shop.com', password: 'secret1' });
      await api.auth.signOut();

      const user = userEvent.setup();
      renderAppAt('/login');
      await user.type(await screen.findByLabelText(/email address/i), 'owner@shop.com');
      await user.type(screen.getByLabelText(/^password/i), 'secret1');
      await user.click(screen.getByRole('button', { name: /^log in/i }));

      // The post-login navigation to '/' is an in-app navigation, so the
      // owner lands in the setup flow, not back on the marketing page.
      expect(await screen.findByText('ONBOARDING PAGE')).toBeTruthy();
      expect(screen.queryByText('LANDING PAGE')).toBe(null);
    });
  });

  describe('as an installed app', () => {
    it('opens the login screen first for a signed-out visitor', async () => {
      await api.auth.signUp({ email: 'halfway@shop.com', password: 'secret1' });
      await api.auth.signOut();

      const restore = stubInstalledDisplayMode();
      try {
        renderAppAt('/');

        expect(await screen.findByLabelText(/email address/i)).toBeTruthy();
        expect(screen.queryByText('LANDING PAGE')).toBe(null);
        expect(screen.queryByText('ONBOARDING PAGE')).toBe(null);
      } finally {
        restore();
      }
    });

    it('opens straight to the dashboard for a signed-in owner with a store', async () => {
      await loginOrCreateDemo();

      const restore = stubInstalledDisplayMode();
      try {
        renderAppAt('/');

        expect(await screen.findByText('DASHBOARD PAGE')).toBeTruthy();
        expect(screen.queryByText('LANDING PAGE')).toBe(null);
        expect(screen.queryByText('ONBOARDING PAGE')).toBe(null);
      } finally {
        restore();
      }
    });

    it('prioritizes login over onboarding for a signed-in account without a store', async () => {
      await api.auth.signUp({ email: 'halfway@shop.com', password: 'secret1' });

      const restore = stubInstalledDisplayMode();
      try {
        renderAppAt('/');

        // The sign-in screen with a way forward, never the onboarding wizard.
        expect(await screen.findByText(/signed in as/i)).toBeTruthy();
        expect(screen.queryByText('ONBOARDING PAGE')).toBe(null);

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /continue store setup/i }));
        expect(await screen.findByText('ONBOARDING PAGE')).toBeTruthy();
      } finally {
        restore();
      }
    });
  });
});
