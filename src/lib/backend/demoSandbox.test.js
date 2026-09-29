// src/lib/backend/demoSandbox.test.js
// Session-scoped demo sandbox for deployments configured with a real backend.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bootDemoSandbox,
  DEMO_SANDBOX_KEY,
  enterDemoSandbox,
  exitDemoSandbox,
  isDemoSandbox,
  leaveDemoSandbox,
} from './index';
import { localAdapter } from './local';
import { loginOrCreateDemo } from '../demo';

describe('demo sandbox backend helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('reports false when the sandbox flag is absent or non-true', () => {
    expect(isDemoSandbox()).toBe(false);
    sessionStorage.setItem(DEMO_SANDBOX_KEY, 'false');
    expect(isDemoSandbox()).toBe(false);
  });

  it('reports true when the sandbox flag is set in sessionStorage', () => {
    sessionStorage.setItem(DEMO_SANDBOX_KEY, 'true');
    expect(isDemoSandbox()).toBe(true);
  });

  it('enterDemoSandbox and exitDemoSandbox toggle the sessionStorage flag', () => {
    enterDemoSandbox();
    expect(sessionStorage.getItem(DEMO_SANDBOX_KEY)).toBe('true');
    expect(isDemoSandbox()).toBe(true);

    exitDemoSandbox();
    expect(sessionStorage.getItem(DEMO_SANDBOX_KEY)).toBe(null);
    expect(isDemoSandbox()).toBe(false);
  });

  it('bootDemoSandbox sets the flag and redirects to the requested path', () => {
    const originalLocation = window.location;
    delete window.location;
    window.location = { href: '' };

    try {
      bootDemoSandbox('/dashboard');
      expect(sessionStorage.getItem(DEMO_SANDBOX_KEY)).toBe('true');
      expect(window.location.href).toBe('/dashboard');
    } finally {
      window.location = originalLocation;
    }
  });

  it('leaveDemoSandbox clears the flag and redirects to the exit path', () => {
    sessionStorage.setItem(DEMO_SANDBOX_KEY, 'true');
    const originalLocation = window.location;
    delete window.location;
    window.location = { href: '' };

    try {
      leaveDemoSandbox('/login');
      expect(sessionStorage.getItem(DEMO_SANDBOX_KEY)).toBe(null);
      expect(window.location.href).toBe('/login');
    } finally {
      window.location = originalLocation;
    }
  });

  it('loginOrCreateDemo with localOnly writes directly to the local adapter', async () => {
    const user = await loginOrCreateDemo({ localOnly: true });
    expect(user.email).toBe('demo@smartstoreng.com');

    // Stored in localStorage session
    const localUser = await localAdapter.auth.getUser();
    expect(localUser?.id).toBe(user.id);

    // Membership created in local adapter
    const membership = await localAdapter.stores.getMyMembership(user.id);
    expect(membership?.store?.name).toBe('Demo Supermart');
    expect(membership?.store?.isDemo).toBe(true);

    const products = await localAdapter.products.list(membership.store.id);
    expect(products.length).toBeGreaterThan(0);
  });
});
