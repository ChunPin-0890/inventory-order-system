import { apiClient } from './client';
import type { CreatePurchaseOrderRequest, PurchaseOrder, ReceivePurchaseOrderRequest } from '../types';

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data } = await apiClient.get<PurchaseOrder[]>('/api/purchase-orders');
  return data;
}

export async function getPurchaseOrder(id: number): Promise<PurchaseOrder> {
  const { data } = await apiClient.get<PurchaseOrder>(`/api/purchase-orders/${id}`);
  return data;
}

export async function createPurchaseOrder(request: CreatePurchaseOrderRequest): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>('/api/purchase-orders', request);
  return data;
}

export async function markPurchaseOrderOrdered(id: number): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(`/api/purchase-orders/${id}/mark-ordered`);
  return data;
}

export async function receivePurchaseOrder(id: number, request: ReceivePurchaseOrderRequest): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(`/api/purchase-orders/${id}/receive`, request);
  return data;
}

export async function cancelPurchaseOrder(id: number): Promise<PurchaseOrder> {
  const { data } = await apiClient.post<PurchaseOrder>(`/api/purchase-orders/${id}/cancel`);
  return data;
}
