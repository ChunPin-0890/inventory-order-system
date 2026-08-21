import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import SuppliersPage from '../SuppliersPage';
import * as suppliersApi from '../../api/suppliers';
import { useAuth } from '../../auth/AuthContext';
import type { Supplier } from '../../types';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockSuppliers: Supplier[] = [
  { id: 1, name: 'Acme Components', contactName: 'Lena Ho', email: 'lena@acme.test', phone: null },
];

describe('SuppliersPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty state when there are no suppliers', async () => {
    vi.spyOn(suppliersApi, 'getSuppliers').mockResolvedValue([]);
    render(<SuppliersPage />);

    expect(await screen.findByText('No suppliers yet. Create one above.')).toBeInTheDocument();
  });

  it('lists existing suppliers with their contact details', async () => {
    vi.spyOn(suppliersApi, 'getSuppliers').mockResolvedValue(mockSuppliers);
    render(<SuppliersPage />);

    expect(await screen.findByText('Acme Components')).toBeInTheDocument();
    expect(screen.getByText('Lena Ho')).toBeInTheDocument();
    expect(screen.getByText('lena@acme.test')).toBeInTheDocument();
  });

  it('submits a new supplier and refreshes the list', async () => {
    vi.spyOn(suppliersApi, 'getSuppliers').mockResolvedValue([]);
    const createSpy = vi.spyOn(suppliersApi, 'createSupplier').mockResolvedValue({
      id: 2, name: 'Northline Supply Co.', contactName: null, email: null, phone: null,
    });
    const user = userEvent.setup();
    render(<SuppliersPage />);

    await user.click(await screen.findByText('+ New Supplier'));
    await user.type(screen.getByLabelText('Name'), 'Northline Supply Co.');
    await user.click(screen.getByRole('button', { name: 'Create Supplier' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Northline Supply Co.' }),
      );
    });
  });

  it('hides the "+ New Supplier" action for guests', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(suppliersApi, 'getSuppliers').mockResolvedValue([]);
    render(<SuppliersPage />);

    await screen.findByText('No suppliers yet. Create one above.');
    expect(screen.queryByText('+ New Supplier')).not.toBeInTheDocument();
  });
});
