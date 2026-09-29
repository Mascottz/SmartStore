// The two-way owner app resolution: who gets monitoring, who gets the full
// (transactional) app, and who is left completely untouched.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredMode,
  hasOwnerModePlan,
  isMobileViewport,
  mobilePathFor,
  readStoredMode,
  resolveOwnerExperience,
  writeStoredMode,
} from './ownerExperience';

describe('resolveOwnerExperience', () => {
  it('leaves staff roles on the standard app regardless of plan or device', () => {
    for (const role of ['admin', 'manager', 'cashier', null]) {
      expect(
        resolveOwnerExperience({
          role,
          plan: 'owner',
          storeIsDemo: true,
          storedMode: 'monitoring',
          isMobile: true,
        })
      ).toBe('standard');
    }
  });

  it('leaves free-plan owners on the standard app (Shop Mode is untouched)', () => {
    expect(
      resolveOwnerExperience({
        role: 'owner',
        plan: 'free',
        storeIsDemo: false,
        storedMode: 'monitoring',
        isMobile: true,
      })
    ).toBe('standard');
  });

  it('sends Owner Mode subscribers on a phone to monitoring by default', () => {
    expect(
      resolveOwnerExperience({
        role: 'owner',
        plan: 'owner',
        storeIsDemo: false,
        storedMode: null,
        isMobile: true,
      })
    ).toBe('monitoring');
  });

  it('sends Owner Mode subscribers on a desktop to transactional by default', () => {
    expect(
      resolveOwnerExperience({
        role: 'owner',
        plan: 'owner',
        storeIsDemo: false,
        storedMode: null,
        isMobile: false,
      })
    ).toBe('transactional');
  });

  it('lets the stored choice win over the device default, both ways', () => {
    const base = { role: 'owner', plan: 'owner', storeIsDemo: false };
    expect(resolveOwnerExperience({ ...base, storedMode: 'transactional', isMobile: true })).toBe(
      'transactional'
    );
    expect(resolveOwnerExperience({ ...base, storedMode: 'monitoring', isMobile: false })).toBe(
      'monitoring'
    );
  });

  it('ignores a nonsense stored value and falls back to the device', () => {
    expect(
      resolveOwnerExperience({
        role: 'owner',
        plan: 'owner',
        storedMode: 'banana',
        isMobile: true,
      })
    ).toBe('monitoring');
  });

  it('treats demo stores as Owner Mode subscribers', () => {
    expect(
      resolveOwnerExperience({
        role: 'owner',
        plan: 'free',
        storeIsDemo: true,
        storedMode: null,
        isMobile: true,
      })
    ).toBe('monitoring');
  });
});

describe('hasOwnerModePlan', () => {
  it('is true for the owner plan and demo stores, false otherwise', () => {
    expect(hasOwnerModePlan({ plan: 'owner', storeIsDemo: false })).toBe(true);
    expect(hasOwnerModePlan({ plan: 'free', storeIsDemo: true })).toBe(true);
    expect(hasOwnerModePlan({ plan: 'free', storeIsDemo: false })).toBe(false);
  });
});

describe('stored mode persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a manual choice per account', () => {
    writeStoredMode('user-1', 'monitoring');
    expect(readStoredMode('user-1')).toBe('monitoring');
    // Another account on the same shared tablet is unaffected.
    expect(readStoredMode('user-2')).toBeNull();
  });

  it('ignores writes without an account or with an unknown mode', () => {
    writeStoredMode(null, 'monitoring');
    writeStoredMode('user-1', 'sideways');
    expect(readStoredMode('user-1')).toBeNull();
  });

  it('clears back to device detection', () => {
    writeStoredMode('user-1', 'transactional');
    clearStoredMode('user-1');
    expect(readStoredMode('user-1')).toBeNull();
  });
});

describe('device detection', () => {
  it('reflects the phone breakpoint without throwing in jsdom', () => {
    expect(typeof isMobileViewport()).toBe('boolean');
  });
});

describe('mobilePathFor', () => {
  it('maps main-app routes onto the monitoring app', () => {
    expect(mobilePathFor('/dashboard')).toBe('/m');
    expect(mobilePathFor('/pos')).toBe('/m');
    expect(mobilePathFor('/inventory')).toBe('/m/inventory');
    expect(mobilePathFor('/sales')).toBe('/m/sales');
    expect(mobilePathFor('/credit')).toBe('/m/credit');
    expect(mobilePathFor('/reports/voids')).toBe('/m/reports/voids');
    expect(mobilePathFor('/admin/approvals')).toBe('/m/approvals');
  });

  it('falls back to the monitoring home for unknown paths', () => {
    expect(mobilePathFor('/somewhere/else')).toBe('/m');
  });
});
