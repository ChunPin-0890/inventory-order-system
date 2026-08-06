import { apiClient } from './client';
import type { CreateProductRequest, Product } from '../types';

export async function getProducts(params?: {
  categoryId?: number;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
}): Promise<Product[]> {
  const { data } = await apiClient.get<Product[]>('/api/products', { params });
  return data;
}

export async function getProduct(id: number): Promise<Product> {
  const { data } = await apiClient.get<Product>(`/api/products/${id}`);
  return data;
}

export async function createProduct(request: CreateProductRequest): Promise<Product> {
  const { data } = await apiClient.post<Product>('/api/products', request);
  return data;
}

export async function updateProduct(
  id: number,
  request: { name: string; description?: string; categoryId: number; unitPrice: number; reorderThreshold: number },
): Promise<Product> {
  const { data } = await apiClient.put<Product>(`/api/products/${id}`, request);
  return data;
}

export async function adjustStock(id: number, quantity: number, reason?: string): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/api/products/${id}/adjust-stock`, { quantity, reason });
  return data;
}

// Soft delete — deactivates the product instead of permanently removing it.
export async function deactivateProduct(id: number): Promise<void> {
  await apiClient.delete(`/api/products/${id}`);
}

export async function reactivateProduct(id: number): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/api/products/${id}/reactivate`);
  return data;
}
