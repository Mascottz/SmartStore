// Public /demo page: one click seeds (or reuses) the demo store, refreshes the
// membership and drops the visitor on the dashboard. These tests pin that flow
// and that a failure surfaces instead of navigating. The demo store is seeded
// into localStorage, so the one-click entry only exists on the local backend;
// with a configured backend (Supabase) the primary CTA must route to real
// signup instead of calling the demo login.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Demo from './Demo';

const { navigate, loginOrCreateDemo, refreshMembership, backendFlags } = vi.hoisted(() => ({
  navigate: vi.fn(),
  loginOrCreateDemo: vi.fn(async () => ({ id: 'demo-user' })),
  refreshMembership: vi.fn(async () => {}),
  backendFlags: { isDemoBackend: true },
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

vi.mock('../lib/backend', () => ({
  // Getter so each test can flip the backend (local demo vs Supabase) before
  // rendering the page.
  get isDemoBackend() {
    return backendFlags.isDemoBackend;
  },
}));

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
    backendFlags.isDemoBackend = true;
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

  it('routes to real signup instead of the demo login when a real backend is configured', async () => {
    backendFlags.isDemoBackend = false;
    render(<Demo />);

    expect(screen.queryByRole('button', { name: /Enter the demo store/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Create your free store/i }));

    expect(loginOrCreateDemo).not.toHaveBeenCalled();
    expect(refreshMembership).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(navigate).not.toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
