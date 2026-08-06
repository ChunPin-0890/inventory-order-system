import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '../ProtectedRoute';
import { useAuth } from '../AuthContext';

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/orders"
          element={
            <ProtectedRoute>
              <div>Orders Page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('renders the protected content when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderAt('/orders');

    expect(screen.getByText('Orders Page')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderAt('/orders');

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Orders Page')).not.toBeInTheDocument();
  });
});
