import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

describe('Landing page social links', () => {
  it('links to the official SmartStore NG X account', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', {
      name: 'Follow SmartStore NG on X (@smartstore_ng)',
    });
    expect(link.getAttribute('href')).toBe('https://x.com/smartstore_ng');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
