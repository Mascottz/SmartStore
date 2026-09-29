// src/lib/ownerExperience.js
// The two-way owner app: Owner Mode subscribers (the store's plan, not the
// staff role) switch between MONITORING and TRANSACTIONAL experiences.
//
//   standard       the app as it has always been (staff roles, and any store
//                  that is not on the Owner Mode plan)
//   monitoring     the mobile-first, strictly-monitoring owner app at /m:
//                  no POS register, no checkout, everything else mirrored
//   transactional  the full app including the POS register
//
// Which one an owner gets is decided here, in one place:
//
//   1. role must be 'owner' and the store must be on the Owner Mode plan
//      (demo stores count); otherwise 'standard', untouched.
//   2. a manually chosen mode (the toggle) always wins, remembered per
//      account on this device.
//   3. with no stored choice the DEVICE decides, freshly, every session:
//      a phone opens monitoring, a desktop opens transactional.

export const OWNER_MODES = ['monitoring', 'transactional'];

// The app's own responsive breakpoint (Tailwind md) is the device line: at or
// below 767px wide we treat the screen as a phone.
const MOBILE_QUERY = '(max-width: 767px)';

const STORAGE_PREFIX = 'smartstore-owner-mode:';

/** True when the current viewport looks like a phone. SSR/jsdom safe. */
export function isMobileViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** The owner's manually chosen mode on this device, if any. */
export function readStoredMode(userId) {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    return OWNER_MODES.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist a manual mode choice for this account on this device. */
export function writeStoredMode(userId, mode) {
  if (!userId || !OWNER_MODES.includes(mode)) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, mode);
  } catch {
    // storage unavailable (private mode): the choice lives only in memory
  }
}

/** Forget the stored choice (used when an owner wants the device to decide). */
export function clearStoredMode(userId) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + userId);
  } catch {
    // ignore
  }
}

/**
 * Does this account's store have the Owner Mode plan (the paid tier that
 * carries the two-way modes)? Demo stores behave as if subscribed.
 */
export function hasOwnerModePlan({ plan, storeIsDemo }) {
  return plan === 'owner' || Boolean(storeIsDemo);
}

/**
 * Resolve which experience this signed-in account should get.
 *
 * @param {object}  args
 * @param {string}  [args.role]        store role: owner | admin | manager | cashier
 * @param {string}  [args.plan]        store plan: free | owner
 * @param {boolean} [args.storeIsDemo] demo stores count as Owner Mode
 * @param {string|null} [args.storedMode] manually chosen mode, if any
 * @param {boolean} [args.isMobile]    device detection result
 * @returns {'standard'|'monitoring'|'transactional'}
 */
export function resolveOwnerExperience({
  role,
  plan,
  storeIsDemo,
  storedMode,
  isMobile,
}) {
  if (role !== 'owner') return 'standard';
  if (!hasOwnerModePlan({ plan, storeIsDemo })) return 'standard';

  if (OWNER_MODES.includes(storedMode)) return storedMode;

  // No manual choice: let the device speak. Re-detected on every fresh
  // session, so the same owner lands in monitoring on their phone and in
  // the full register app on the shop computer.
  return isMobile ? 'monitoring' : 'transactional';
}

// Where the main (transactional) app routes send an owner who is in
// monitoring mode; deep links land on the closest monitoring screen.
const MAIN_TO_MOBILE = {
  '/dashboard': '/m',
  '/inventory': '/m/inventory',
  '/pos': '/m',
  '/sales': '/m/sales',
  '/credit': '/m/credit',
  '/reports': '/m/reports',
  '/reports/voids': '/m/reports/voids',
  '/reports/expenses': '/m/reports/expenses',
  '/expenses': '/m/expenses',
  '/team': '/m/team',
  '/owner-settings': '/m/owner-settings',
  '/admin/approvals': '/m/approvals',
  '/pricing': '/m/pricing',
};

/** The monitoring-app equivalent of a main-app path. */
export function mobilePathFor(path) {
  if (MAIN_TO_MOBILE[path]) return MAIN_TO_MOBILE[path];
  if (path.startsWith('/reports')) return '/m/reports';
  return '/m';
}
