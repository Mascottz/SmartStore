// src/components/HelpTip.jsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const TOOLTIP_GAP = 8;
const VIEWPORT_EDGE = 8;
const DEFAULT_TOOLTIP_HEIGHT = 64;
const DEFAULT_TOOLTIP_WIDTH = 256;

/** Keep a value between two bounds, even when the available range is tiny. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Small "help" button that reveals an explanation on hover, focus or tap.
 *
 * The tooltip is rendered in a portal so it is not trapped inside a card,
 * table, modal, or scroll container with `overflow: hidden`. Its position is
 * calculated from the trigger and viewport: it flips above the trigger when
 * there is not enough room below, stays inside the horizontal viewport, and
 * becomes scrollable when the viewport is shorter than the explanation.
 *
 * The tooltip is only rendered while open, so the page can be scanned without
 * a wall of always-visible copy and screen readers get one `role="tooltip"`
 * at a time. Escape and clicking elsewhere close it.
 *
 * The button deliberately does NOT set a native `title`: the browser would
 * pop its own OS tooltip on hover on top of our custom bubble, so the same
 * text showed twice. The accessible name comes from `aria-label` and the
 * open bubble is wired up with `aria-describedby`, so nothing is lost.
 *
 * `label` is the accessible name of the help button (e.g. "Help: Stock at
 * cost") so a page with several tips still reads clearly.
 */
export default function HelpTip({ label, text, className = '', iconClassName = '' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const tipRef = useRef(null);
  const closeTimerRef = useRef(null);
  const tipId = useId();

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openTip = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const close = () => {
    clearCloseTimer();
    setOpen(false);
  };

  // Give the pointer a moment to cross the small gap between the trigger and
  // the portalled bubble. This also lets a user move into a tall tooltip and
  // scroll it when the viewport cannot show the whole explanation at once.
  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 120);
  };

  useEffect(() => () => clearCloseTimer(), []);

  // Keep the bubble attached to its trigger while a page or an inner panel
  // scrolls, and recalculate it after a resize (including mobile viewport
  // changes when the browser chrome or keyboard appears).
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const trigger = rootRef.current?.getBoundingClientRect();
      const tip = tipRef.current?.getBoundingClientRect();
      if (!trigger || !tip) return;

      const viewportWidth =
        window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight =
        window.visualViewport?.height || document.documentElement.clientHeight || window.innerHeight;

      // The CSS width normally measures 16rem. The fallback matters on the
      // first layout in browsers that report a zero rect while mounting.
      const tipWidth = Math.min(tip.width || DEFAULT_TOOLTIP_WIDTH, viewportWidth - VIEWPORT_EDGE * 2);
      const measuredHeight = tip.height || DEFAULT_TOOLTIP_HEIGHT;
      const spaceBelow = viewportHeight - trigger.bottom - TOOLTIP_GAP - VIEWPORT_EDGE;
      const spaceAbove = trigger.top - TOOLTIP_GAP - VIEWPORT_EDGE;

      // Prefer below, but use the side with more room if neither side can fit
      // the full explanation. maxHeight plus overflow-y-auto keeps the rest
      // reachable instead of letting it disappear outside the viewport.
      const placeAbove = spaceBelow < measuredHeight && spaceAbove > spaceBelow;
      const availableHeight = Math.max(1, Math.floor(placeAbove ? spaceAbove : spaceBelow));
      const visibleHeight = Math.min(measuredHeight, availableHeight);
      const left = clamp(
        trigger.right - tipWidth,
        VIEWPORT_EDGE,
        viewportWidth - VIEWPORT_EDGE - tipWidth
      );
      const top = placeAbove
        ? trigger.top - TOOLTIP_GAP - visibleHeight
        : trigger.bottom + TOOLTIP_GAP;

      setPosition({
        left: Math.round(left),
        top: Math.round(top),
        maxHeight: availableHeight,
        placement: placeAbove ? 'top' : 'bottom',
      });
    };

    // The portal node is already mounted by the time a layout effect runs.
    updatePosition();

    window.addEventListener('resize', updatePosition);
    // `scroll` does not bubble, so capture it to also catch scrolling inside
    // the app's panels and tables.
    window.addEventListener('scroll', updatePosition, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updatePosition);
    viewport?.addEventListener('scroll', updatePosition);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null;
    if (resizeObserver) {
      if (rootRef.current) resizeObserver.observe(rootRef.current);
      if (tipRef.current) resizeObserver.observe(tipRef.current);
    }

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      viewport?.removeEventListener('resize', updatePosition);
      viewport?.removeEventListener('scroll', updatePosition);
      resizeObserver?.disconnect();
    };
  }, [open]);

  // Clicking (or tapping) elsewhere, or pressing Escape, dismisses the tip.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      const clickedTrigger = rootRef.current?.contains(e.target);
      const clickedTooltip = tipRef.current?.contains(e.target);
      if (!clickedTrigger && !clickedTooltip) close();
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

  const tooltip = open ? (
    <span
      ref={tipRef}
      id={tipId}
      role="tooltip"
      data-placement={position?.placement || undefined}
      className="pointer-events-auto fixed z-[100] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto break-words rounded-xl bg-zinc-900 px-3 py-2 text-[11px] leading-relaxed text-zinc-100 shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
      onMouseEnter={openTip}
      onMouseLeave={scheduleClose}
      style={{
        left: position?.left ?? VIEWPORT_EDGE,
        top: position?.top ?? VIEWPORT_EDGE,
        maxHeight: position ? `${position.maxHeight}px` : undefined,
        // Avoid a frame at the top-left of the page while the first position
        // is being measured. Opacity does not hide the accessible tooltip.
        opacity: position ? 1 : 0,
      }}
    >
      {text}
    </span>
  ) : null;

  return (
    <>
      <span ref={rootRef} className={`relative inline-flex align-middle ${className}`}>
        <button
          type="button"
          aria-label={label}
          aria-describedby={open ? tipId : undefined}
          aria-expanded={open}
          className={`shrink-0 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${iconClassName}`}
          onFocus={openTip}
          onBlur={close}
          onClick={(e) => {
            e.stopPropagation();
            openTip();
          }}
          onMouseEnter={openTip}
          onMouseLeave={scheduleClose}
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      </span>
      {typeof document !== 'undefined' && document.body
        ? createPortal(tooltip, document.body)
        : null}
    </>
  );
}
