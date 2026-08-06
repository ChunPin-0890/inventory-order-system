export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string | null;
  categoryId: number;
  categoryName: string;
  unitPrice: number;
  quantityOnHand: number;
  reorderThreshold: number;
  isLowStock: boolean;
  isActive: boolean;
}

export interface CreateProductRequest {
  sku: string;
  name: string;
  description?: string;
  categoryId: number;
  unitPrice: number;
  quantityOnHand: number;
  reorderThreshold: number;
}

export type OrderStatus = 'Pending' | 'Confirmed' | 'Shipped' | 'Completed' | 'Cancelled';

export interface OrderItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
}

export interface CreateOrderRequest {
  customerName: string;
  items: { productId: number; quantity: number }[];
}

export type UserRole = 'Admin' | 'Staff';

export interface AuthUser {
  username: string;
  role: UserRole;
  token: string;
  expiresAt: string;
}
