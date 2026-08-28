// src/components/HelpTip.jsx
import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Small "help" button that reveals an explanation on hover, focus or tap.
 *
 * The tooltip is only rendered while open, so the page can be scanned without
 * a wall of always-visible copy and screen readers get one `role="tooltip"`
 * at a time. Escape and clicking elsewhere close it, and the button keeps a
 * native `title` as a fallback for browsers/tools that do not use ARIA.
 *
 * `label` is the accessible name of the help button (e.g. "Help: Stock at
 * cost") so a page with several tips still reads clearly.
 */
export default function HelpTip({ label, text, className = '', iconClassName = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const tipId = useId();

  const close = () => setOpen(false);

  // Clicking (or tapping) elsewhere, or pressing Escape, dismisses the tip.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Only the tip swallows Escape while it is open, so the page's own
        // shortcuts (e.g. "clear POS filters") don't fire through it.
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        title={text}
        className={`shrink-0 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${iconClassName}`}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={close}
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 w-64 max-w-[16rem] rounded-xl bg-zinc-900 px-3 py-2 text-[11px] leading-relaxed text-zinc-100 shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {text}
        </span>
      )}
    </span>
  );
}
