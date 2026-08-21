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

export interface Supplier {
  id: number;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CreateSupplierRequest {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export type PurchaseOrderStatus = 'Draft' | 'Ordered' | 'Received' | 'Cancelled';

export interface PurchaseOrderItem {
  id: number;
  productId: number;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId: number;
  supplierName: string;
  status: PurchaseOrderStatus;
  createdAt: string;
  orderedAt?: string | null;
  expectedAt?: string | null;
  items: PurchaseOrderItem[];
}

export interface CreatePurchaseOrderRequest {
  supplierId: number;
  expectedAt?: string | null;
  items: { productId: number; quantity: number }[];
}

export interface ReceivePurchaseOrderRequest {
  lines: { purchaseOrderItemId: number; receivedQuantity: number }[];
}
