// src/hooks/useBarcodeScanner.js
// USB barcode scanners behave like a second keyboard: they "type" the barcode
// characters very rapidly (typically 10-60ms apart) and finish with Enter.
// This hook listens globally for that pattern and calls `onScan(code)` once a
// scan is recognised. Recognised keystrokes are swallowed (preventDefault) so
// the barcode never leaks into whatever input happens to be focused, while
// normal human typing passes through untouched.
//
// Usage:
//   useBarcodeScanner((code) => addProductByBarcode(code), {
//     enabled: niche.hasBarcode, // attach only when the store uses barcodes
//   });
import { useEffect, useRef } from 'react';

// Keys we ignore entirely while buffering (they don't break a scan).
const IGNORED_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];

// Scanned characters land in whatever input is focused (the hook can only
// recognise the scan once Enter arrives). Remove them again so the focused
// field does not keep the barcode text, then notify React via an input event.
function stripFromActiveInput(code) {
  if (typeof document === 'undefined' || !code) return;
  const el = document.activeElement;
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
  const idx = el.value.lastIndexOf(code);
  if (idx === -1) return;
  const proto = el.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, (el.value.slice(0, idx) + el.value.slice(idx + code.length)).trimStart());
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function useBarcodeScanner(onScan, options = {}) {
  const {
    enabled = true,
    minLength = 4, // a barcode shorter than this is almost certainly typed by hand
    maxKeyInterval = 60, // ms between characters; scanners are far faster than any typist
    maxLength = 128, // guard against runaway buffers
    clearFromActiveInput = true, // strip scanned chars out of a focused input after detection
  } = options;

  // Keep the callback fresh without re-binding the global listener.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let lastKeyAt = 0;
    let widestGap = 0;

    const reset = () => {
      buffer = '';
      widestGap = 0;
    };

    const handleKeyDown = (e) => {
      // Modifier combos (Ctrl+C, Cmd+Tab, ...) are never scanner input.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        reset();
        return;
      }

      if (IGNORED_KEYS.includes(e.key)) return;

      const now = performance.now();

      if (e.key === 'Enter') {
        const code = buffer.trim();
        const isScan =
          code.length >= minLength && code.length <= maxLength && widestGap > 0 && widestGap <= maxKeyInterval;
        reset();
        if (isScan) {
          // Scanner terminator: don't let it submit a form or focus-jump.
          e.preventDefault();
          if (clearFromActiveInput) stripFromActiveInput(code);
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length !== 1) {
        // Arrows, Tab, Escape, ... break the character run.
        reset();
        return;
      }

      if (now - lastKeyAt > maxKeyInterval) {
        // Too slow since the previous character: human typing, start fresh.
        reset();
      } else if (lastKeyAt) {
        widestGap = Math.max(widestGap, now - lastKeyAt);
      }
      lastKeyAt = now;
      buffer += e.key;

      if (buffer.length > maxLength) reset();
    };

    // Capture phase so a scan can be intercepted before it reaches a focused input.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, minLength, maxKeyInterval, maxLength, clearFromActiveInput]);
}
