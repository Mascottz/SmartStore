// src/lib/pwa.js
// Is the app running as an *installed* PWA — launched from a home-screen
// icon, the desktop, or the OS app list — rather than in a plain browser tab?
//
// The launch destination depends on it: an installed launch must skip the
// marketing landing page and open on the sign-in screen instead, while a
// normal browser open always starts at the landing page. The display mode
// cannot change for a document once it is loaded (only a reload in a
// different context changes it), so a plain function is enough — no hook,
// no listeners.

export function isInstalledPwa() {
  if (typeof window === 'undefined') return false;

  // iOS Safari still has no display-mode media feature; the proprietary
  // navigator.standalone flag is the only signal there.
  if (window.navigator?.standalone === true) return true;

  // Everywhere else (Android/Chrome, Edge, desktop installs) the manifest's
  // display mode is reported as a media feature once the app is installed.
  // "window-controls-overlay" is how desktop PWAs with title-bar buttons run.
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
      window.matchMedia?.('(display-mode: minimal-ui)')?.matches === true ||
      window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches === true
    );
  } catch {
    // matchMedia unavailable or unsupported queries: treat as a browser tab.
    return false;
  }
}
