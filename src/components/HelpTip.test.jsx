// HelpTip: the small "?" button used to explain the newer POS and inventory
// surfaces without covering the page in always-visible copy.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import HelpTip from './HelpTip';

describe('HelpTip', () => {
  it('renders an accessible help button with a fallback title', () => {
    render(<HelpTip label="Help: Stock at cost" text="What the stock cost you." />);

    expect(
      screen.getByRole('button', { name: 'Help: Stock at cost' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Help: Stock at cost' }).getAttribute('title')
    ).toBe('What the stock cost you.');
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
});
