import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import OrdersPage from '../OrdersPage';
import * as ordersApi from '../../api/orders';
import * as productsApi from '../../api/products';
import { useAuth } from '../../auth/AuthContext';
import type { Product } from '../../types';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockProducts: Product[] = [
  {
    id: 1, sku: 'SKU-A', name: 'Widget A', description: null, categoryId: 1, categoryName: 'Hardware',
    unitPrice: 5, quantityOnHand: 10, reorderThreshold: 2, isLowStock: false, isActive: true,
  },
  {
    id: 2, sku: 'SKU-B', name: 'Widget B', description: null, categoryId: 1, categoryName: 'Hardware',
    unitPrice: 3, quantityOnHand: 10, reorderThreshold: 2, isLowStock: false, isActive: true,
  },
];

describe('OrdersPage — multi-item order form', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(ordersApi, 'getOrders').mockResolvedValue([]);
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(mockProducts);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with a single empty product line, and "+ Add item" adds another', async () => {
    const user = userEvent.setup();
    render(<OrdersPage />);

    await user.click(await screen.findByText('+ New Order'));

    expect(screen.getAllByRole('combobox')).toHaveLength(1);

    await user.click(screen.getByText('+ Add item'));

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('"Remove" deletes a line, but only shows once there is more than one', async () => {
    const user = userEvent.setup();
    render(<OrdersPage />);

    await user.click(await screen.findByText('+ New Order'));

    // Only one line — no Remove button yet.
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();

    await user.click(screen.getByText('+ Add item'));
    expect(screen.getAllByText('Remove')).toHaveLength(2);

    await user.click(screen.getAllByText('Remove')[0]);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('submits an order with multiple line items to the API', async () => {
    const createOrderSpy = vi.spyOn(ordersApi, 'createOrder').mockResolvedValue({
      id: 1, orderNumber: 'ORD-1', customerName: 'Grace Tan', status: 'Pending',
      totalAmount: 31, createdAt: new Date().toISOString(), items: [],
    });
    const user = userEvent.setup();
    render(<OrdersPage />);

    await user.click(await screen.findByText('+ New Order'));
    await user.type(screen.getByLabelText('Customer Name'), 'Grace Tan');

    const [firstSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(firstSelect, '1');
    await user.clear(screen.getAllByRole('spinbutton')[0]);
    await user.type(screen.getAllByRole('spinbutton')[0], '3');

    await user.click(screen.getByText('+ Add item'));
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], '2');
    const quantityInputs = screen.getAllByRole('spinbutton');
    await user.clear(quantityInputs[1]);
    await user.type(quantityInputs[1], '5');

    await user.click(screen.getByRole('button', { name: 'Place Order' }));

    await waitFor(() => {
      expect(createOrderSpy).toHaveBeenCalledWith({
        customerName: 'Grace Tan',
        items: [
          { productId: 1, quantity: 3 },
          { productId: 2, quantity: 5 },
        ],
      });
    });
  });

  it('does not submit when no product line is selected (blocked by required field)', async () => {
    const createOrderSpy = vi.spyOn(ordersApi, 'createOrder');
    const user = userEvent.setup();
    render(<OrdersPage />);

    await user.click(await screen.findByText('+ New Order'));
    await user.type(screen.getByLabelText('Customer Name'), 'No Product Order');
    await user.click(screen.getByRole('button', { name: 'Place Order' }));

    // The product <select> is `required`, so the browser's native validation blocks
    // submission before our own "at least one item" check ever runs.
    expect(createOrderSpy).not.toHaveBeenCalled();
    expect(screen.getByText('No orders yet. Place one above.')).toBeInTheDocument();
  });
});
