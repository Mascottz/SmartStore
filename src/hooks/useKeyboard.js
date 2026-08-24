// src/hooks/useKeyboard.js
// Listen for keyboard shortcuts. Cleans up on unmount.
import { useEffect } from 'react';

/**
 * Register global keyboard shortcuts.
 * @param {Object} shortcuts  Map of key combo to handler.
 *   Combos: "Escape", "F2", "Ctrl+Enter", "Ctrl+P", etc.
 */
export function useKeyboard(shortcuts) {
  useEffect(() => {
    const handler = (e) => {
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      // Don't capture modifier-only keys
      const key = e.key;
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;

      parts.push(key);
      const combo = parts.join('+');

      if (shortcuts[combo]) {
        // Don't fire shortcuts when typing in inputs (unless it's Escape or a Ctrl combo)
        const tag = e.target.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        if (isInput && key !== 'Escape' && !e.ctrlKey && !e.metaKey) return;

        e.preventDefault();
        shortcuts[combo]();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
