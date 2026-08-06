import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import { AUTH_STORAGE_KEY } from '../../api/client';
import * as authApi from '../../api/auth';
import type { AuthUser } from '../../types';

const mockAdminUser: AuthUser = {
  username: 'admin',
  role: 'Admin',
  token: 'fake-jwt-token',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
};

function TestConsumer() {
  const { user, isAuthenticated, isAdmin, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="username">{user?.username ?? 'none'}</span>
      <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
      <span data-testid="is-admin">{String(isAdmin)}</span>
      <button onClick={() => login('admin', 'Admin123!')}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts unauthenticated when localStorage is empty', () => {
    renderWithProvider();
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('username')).toHaveTextContent('none');
  });

  it('logs in, updates state, and persists to localStorage', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(mockAdminUser);
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('username')).toHaveTextContent('admin');
    expect(screen.getByTestId('is-admin')).toHaveTextContent('true');

    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!);
    expect(stored.username).toBe('admin');
  });

  it('logs out and clears localStorage', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(mockAdminUser);
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('Login'));
    await waitFor(() => expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true'));

    await user.click(screen.getByText('Logout'));

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('treats an expired stored session as logged out', () => {
    const expiredUser: AuthUser = {
      ...mockAdminUser,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second in the past
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(expiredUser));

    renderWithProvider();

    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
    // Expired session should also be cleared out of storage, not just ignored.
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('marks Staff role as authenticated but not admin', async () => {
    const staffUser: AuthUser = { ...mockAdminUser, username: 'staff', role: 'Staff' };
    vi.spyOn(authApi, 'login').mockResolvedValue(staffUser);
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('Login'));

    await waitFor(() => expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true'));
    expect(screen.getByTestId('is-admin')).toHaveTextContent('false');
  });
});
