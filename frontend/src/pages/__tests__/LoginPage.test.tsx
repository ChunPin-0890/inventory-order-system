import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '../LoginPage';
import { useAuth } from '../../auth/AuthContext';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('fills in demo Admin credentials when "Use Admin" is clicked', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByText('Use Admin'));

    expect(screen.getByLabelText('Username')).toHaveValue('admin');
    expect(screen.getByLabelText('Password')).toHaveValue('Admin123!');
  });

  it('calls login with the entered credentials on submit', async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      login: mockLogin,
      logout: vi.fn(),
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Username'), 'staff');
    await user.type(screen.getByLabelText('Password'), 'Staff123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('staff', 'Staff123!');
    });
  });

  it('shows an error message when login fails', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      login: mockLogin,
      logout: vi.fn(),
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid username or password.')).toBeInTheDocument();
  });
});
