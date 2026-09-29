// src/test/setup.js
// Shims for browser APIs that jsdom does not implement.

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  // jsdom has no layout engine. The assistant keeps its transcript pinned to
  // the latest message with scrollIntoView, which would otherwise throw.
  Element.prototype.scrollIntoView = () => {};
}

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
