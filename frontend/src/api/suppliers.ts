import { apiClient } from './client';
import type { CreateSupplierRequest, Supplier } from '../types';

export async function getSuppliers(): Promise<Supplier[]> {
  const { data } = await apiClient.get<Supplier[]>('/api/suppliers');
  return data;
}

export async function createSupplier(request: CreateSupplierRequest): Promise<Supplier> {
  const { data } = await apiClient.post<Supplier>('/api/suppliers', request);
  return data;
}
