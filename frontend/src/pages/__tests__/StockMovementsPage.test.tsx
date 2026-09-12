import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, afterEach } from 'vitest';
import StockMovementsPage from '../StockMovementsPage';
import * as stockMovementsApi from '../../api/stockMovements';
import * as productsApi from '../../api/products';
import type { Product, StockMovement } from '../../types';

const mockProducts: Product[] = [
  {
    id: 1, sku: 'SKU-A', name: 'Widget A', description: null, categoryId: 1, categoryName: 'Hardware',
    unitPrice: 5, quantityOnHand: 10, reorderThreshold: 2, isLowStock: false, isActive: true, createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2, sku: 'SKU-B', name: 'Widget B', description: null, categoryId: 1, categoryName: 'Hardware',
    unitPrice: 3, quantityOnHand: 4, reorderThreshold: 2, isLowStock: false, isActive: true, createdAt: '2026-01-01T00:00:00Z',
  },
];

const mockMovements: StockMovement[] = [
  {
    id: 1, productId: 1, productName: 'Widget A', type: 'StockIn', quantity: 10,
    reason: 'Initial stock', orderId: null, createdAt: new Date().toISOString(),
  },
  {
    id: 2, productId: 1, productName: 'Widget A', type: 'StockOut', quantity: 2,
    reason: 'Order ORD-1', orderId: 1, createdAt: new Date().toISOString(),
  },
];

function renderPage(initialPath = '/stock-movements') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <StockMovementsPage />
    </MemoryRouter>,
  );
}

describe('StockMovementsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists movements with a readable +/- quantity based on type', async () => {
    vi.spyOn(stockMovementsApi, 'getStockMovements').mockResolvedValue(mockMovements);
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(mockProducts);
    renderPage();

    expect(await screen.findByText('+10')).toBeInTheDocument();
    expect(screen.getByText('−2')).toBeInTheDocument();
    expect(screen.getByText('Order ORD-1')).toBeInTheDocument();
  });

  it('shows a helpful empty state when no movements match', async () => {
    vi.spyOn(stockMovementsApi, 'getStockMovements').mockResolvedValue([]);
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(mockProducts);
    renderPage();

    expect(await screen.findByText('No stock movements match these filters.')).toBeInTheDocument();
  });

  it('pre-selects the product filter from a ?productId= query param', async () => {
    const getMovementsSpy = vi.spyOn(stockMovementsApi, 'getStockMovements').mockResolvedValue([]);
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(mockProducts);
    renderPage('/stock-movements?productId=2');

    await waitFor(() => {
      expect(getMovementsSpy).toHaveBeenCalledWith(expect.objectContaining({ productId: 2 }));
    });
    expect(await screen.findByDisplayValue('Widget B (SKU-B)')).toBeInTheDocument();
  });

  it('re-fetches with the selected type filter', async () => {
    const getMovementsSpy = vi.spyOn(stockMovementsApi, 'getStockMovements').mockResolvedValue(mockMovements);
    vi.spyOn(productsApi, 'getProducts').mockResolvedValue(mockProducts);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('+10');
    await user.selectOptions(screen.getByDisplayValue('All types'), 'StockOut');

    await waitFor(() => {
      expect(getMovementsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'StockOut' }));
    });
  });
});
