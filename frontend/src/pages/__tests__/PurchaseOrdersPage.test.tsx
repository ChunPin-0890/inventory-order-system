import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import PurchaseOrdersPage from '../PurchaseOrdersPage';
import * as purchaseOrdersApi from '../../api/purchaseOrders';
import * as suppliersApi from '../../api/suppliers';
import * as productsApi from '../../api/products';
import { useAuth } from '../../auth/AuthContext';
import type { Product, PurchaseOrder, Supplier } from '../../types';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockSuppliers: Supplier[] = [{ id: 1, name: 'Acme Components', contactName: null, email: null, phone: null }];

const mockProducts: Product[] = [
  {
    id: 1, sku: 'SKU-A', name: 'Widget A', description: null, categoryId: 1, categoryName: 'Hardware',
    unitPrice: 5, quantityOnHand: 10, reorderThreshold: 2, isLowStock: false, isActive: true, createdAt: '2026-01-01T00:00:00Z',
  },
];

function makePO(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 1,
    poNumber: 'PO-1',
    supplierId: 1,
    supplierName: 'Acme Components',
    status: 'Draft',
    createdAt: new Date().toISOString(),
    orderedAt: null,
    expectedAt: null,
    items: [{ id: 10, productId: 1, productName: 'Widget A', orderedQuantity: 20, receivedQuantity: 0 }],
    ...overrides,
  };
}

describe('PurchaseOrdersPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.spyOn(suppliersApi, 'getSuppliers').mockResolvedValue(mockSuppliers);
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(mockProducts);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a purchase order with the selected supplier and line items', async () => {
    vi.spyOn(purchaseOrdersApi, 'getPurchaseOrders').mockResolvedValue([]);
    const createSpy = vi.spyOn(purchaseOrdersApi, 'createPurchaseOrder').mockResolvedValue(makePO());
    const user = userEvent.setup();
    render(<PurchaseOrdersPage />);

    await user.click(await screen.findByText('+ New PO'));

    // Three <select>s once the form is open: [0] the status filter (always present),
    // [1] Supplier, [2] the line item's product picker.
    const [, supplierSelect, productSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(supplierSelect, '1');
    await user.selectOptions(productSelect, '1');

    const quantityInput = screen.getAllByRole('spinbutton')[0];
    await user.clear(quantityInput);
    await user.type(quantityInput, '20');

    await user.click(screen.getByRole('button', { name: 'Create Purchase Order' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        supplierId: 1,
        expectedAt: null,
        items: [{ productId: 1, quantity: 20 }],
      });
    });
  });

  it('filters the list by status', async () => {
    vi.spyOn(purchaseOrdersApi, 'getPurchaseOrders').mockResolvedValue([
      makePO({ id: 1, poNumber: 'PO-DRAFT', status: 'Draft' }),
      makePO({ id: 2, poNumber: 'PO-ORDERED', status: 'Ordered' }),
    ]);
    const user = userEvent.setup();
    render(<PurchaseOrdersPage />);

    expect(await screen.findByText('PO-DRAFT')).toBeInTheDocument();
    expect(screen.getByText('PO-ORDERED')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), 'Draft');

    expect(screen.getByText('PO-DRAFT')).toBeInTheDocument();
    expect(screen.queryByText('PO-ORDERED')).not.toBeInTheDocument();
  });

  it('marks a Draft purchase order as Ordered', async () => {
    vi.spyOn(purchaseOrdersApi, 'getPurchaseOrders').mockResolvedValue([makePO({ status: 'Draft' })]);
    const markOrderedSpy = vi.spyOn(purchaseOrdersApi, 'markPurchaseOrderOrdered').mockResolvedValue(makePO({ status: 'Ordered' }));
    const user = userEvent.setup();
    render(<PurchaseOrdersPage />);

    await user.click(await screen.findByText('Mark Ordered'));

    await waitFor(() => {
      expect(markOrderedSpy).toHaveBeenCalledWith(1);
    });
  });

  it('receives stock for an Ordered purchase order using the outstanding quantity by default', async () => {
    vi.spyOn(purchaseOrdersApi, 'getPurchaseOrders').mockResolvedValue([makePO({ status: 'Ordered' })]);
    const receiveSpy = vi.spyOn(purchaseOrdersApi, 'receivePurchaseOrder').mockResolvedValue(makePO({ status: 'Received' }));
    const user = userEvent.setup();
    render(<PurchaseOrdersPage />);

    await user.click(await screen.findByText('Receive'));
    await user.click(screen.getByRole('button', { name: 'Receive Selected' }));

    await waitFor(() => {
      expect(receiveSpy).toHaveBeenCalledWith(1, { lines: [{ purchaseOrderItemId: 10, receivedQuantity: 20 }] });
    });
  });

  it('only shows Cancel to admins', async () => {
    vi.spyOn(purchaseOrdersApi, 'getPurchaseOrders').mockResolvedValue([makePO({ status: 'Draft' })]);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<PurchaseOrdersPage />);

    await screen.findByText('PO-1');
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });
});
