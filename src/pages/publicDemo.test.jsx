// Public /demo page: one click seeds (or reuses) the demo store, refreshes the
// membership and drops the visitor on the dashboard. These tests pin that flow
// and that a failure surfaces instead of navigating.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Demo from './Demo';

const { navigate, loginOrCreateDemo, refreshMembership } = vi.hoisted(() => ({
  navigate: vi.fn(),
  loginOrCreateDemo: vi.fn(async () => ({ id: 'demo-user' })),
  refreshMembership: vi.fn(async () => {}),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../lib/demo', () => ({ loginOrCreateDemo }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ refreshMembership }),
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

describe('Public demo page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers a one-click entry into the demo store', () => {
    render(<Demo />);
    expect(screen.getByRole('button', { name: /Enter the demo store/i })).toBeTruthy();
  });

  it('seeds the demo, refreshes membership and lands on the dashboard', async () => {
    render(<Demo />);

    await userEvent.click(screen.getByRole('button', { name: /Enter the demo store/i }));

    await waitFor(() => expect(loginOrCreateDemo).toHaveBeenCalledTimes(1));
    expect(refreshMembership).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('stays on the page when seeding the demo fails', async () => {
    loginOrCreateDemo.mockRejectedValueOnce(new Error('offline'));
    render(<Demo />);

    await userEvent.click(screen.getByRole('button', { name: /Enter the demo store/i }));

    await waitFor(() => expect(loginOrCreateDemo).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
  });
});
