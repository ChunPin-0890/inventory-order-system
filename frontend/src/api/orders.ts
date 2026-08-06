import { apiClient } from './client';
import type { CreateOrderRequest, Order, OrderStatus } from '../types';

export async function getOrders(search?: string): Promise<Order[]> {
  const { data } = await apiClient.get<Order[]>('/api/orders', { params: search ? { search } : undefined });
  return data;
}

export async function getOrder(id: number): Promise<Order> {
  const { data } = await apiClient.get<Order>(`/api/orders/${id}`);
  return data;
}

export async function createOrder(request: CreateOrderRequest): Promise<Order> {
  const { data } = await apiClient.post<Order>('/api/orders', request);
  return data;
}

export async function updateOrderStatus(id: number, status: OrderStatus): Promise<Order> {
  const { data } = await apiClient.patch<Order>(`/api/orders/${id}/status`, { status });
  return data;
}
