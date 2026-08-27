// src/test/setup.js
// Shims for browser APIs that jsdom does not implement.

if (typeof window !== 'undefined' && !window.matchMedia) {
  // react-hot-toast (and friends) ask for the viewport width via matchMedia.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
