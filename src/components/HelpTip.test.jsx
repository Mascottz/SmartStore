// HelpTip: the small "?" button used to explain the newer POS and inventory
// surfaces without covering the page in always-visible copy.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import HelpTip from './HelpTip';

describe('HelpTip', () => {
  it('renders an accessible help button without a native title', () => {
    render(<HelpTip label="Help: Stock at cost" text="What the stock cost you." />);

    const button = screen.getByRole('button', { name: 'Help: Stock at cost' });
    expect(button).toBeTruthy();
    // No native `title`: it would trigger the browser's own OS tooltip on hover
    // in addition to our custom bubble, showing the same text twice.
    expect(button.getAttribute('title')).toBeNull();
  });

  it('shows exactly one tooltip when opened (no duplicate bubble)', () => {
    render(<HelpTip label="Help: Single tip" text="Only shown once." />);

    fireEvent.focus(screen.getByRole('button', { name: 'Help: Single tip' }));

    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip').textContent).toBe('Only shown once.');
  });

  it('shows the explanation on focus and hides it on Escape', () => {
    render(<HelpTip label="Help: Result count" text="Matches vs total." />);

    fireEvent.focus(screen.getByRole('button', { name: 'Help: Result count' }));

    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Matches vs total.');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    // The button is back to its rest state, ready to be triggered again.
    expect(
      screen.getByRole('button', { name: 'Help: Result count' }).getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('dismisses when the caller clicks somewhere else', () => {
    const { container } = render(
      <div>
        <HelpTip label="Help: Category filters" text="Pills per shelf." />
        <button type="button">Other button</button>
      </div>
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Help: Category filters' }));
    expect(screen.getByRole('tooltip').textContent).toBe('Pills per shelf.');

    fireEvent.pointerDown(container.querySelector('button:not([aria-label])'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('moves above a trigger near the bottom and renders outside clipping containers', () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getRect() {
        if (this.getAttribute('role') === 'tooltip') {
          return { top: 0, bottom: 100, left: 0, right: 256, width: 256, height: 100 };
        }
        return { top: 700, bottom: 724, left: 700, right: 724, width: 24, height: 24 };
      });

    try {
      render(
        <div style={{ overflow: 'hidden' }}>
          <HelpTip label="Help: Bottom tip" text="This should remain fully reachable." />
        </div>
      );
      fireEvent.focus(screen.getByRole('button', { name: 'Help: Bottom tip' }));

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.getAttribute('data-placement')).toBe('top');
      expect(tooltip.parentElement).toBe(document.body);
      expect(tooltip.className).toContain('overflow-y-auto');
      expect(tooltip.style.top).toBe('592px');
    } finally {
      rectSpy.mockRestore();
      // Keep the original reference explicit: this test documents that the
      // geometry mock is scoped to this test only.
      expect(HTMLElement.prototype.getBoundingClientRect).toBe(originalRect);
    }
  });
});
