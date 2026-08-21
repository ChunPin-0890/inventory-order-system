import { apiClient } from './client';
import type { StockMovement, StockMovementType } from '../types';

export interface StockMovementFilters {
  productId?: number;
  type?: StockMovementType;
  from?: string;
  to?: string;
}

export async function getStockMovements(filters: StockMovementFilters = {}): Promise<StockMovement[]> {
  const params: Record<string, string | number> = {};
  if (filters.productId) params.productId = filters.productId;
  if (filters.type) params.type = filters.type;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;

  const { data } = await apiClient.get<StockMovement[]>('/api/stock-movements', { params });
  return data;
}
