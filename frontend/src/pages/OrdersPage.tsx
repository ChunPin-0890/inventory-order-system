import { useEffect, useState } from 'react';
import { createOrder, getOrders, updateOrderStatus } from '../api/orders';
import { getProducts } from '../api/products';
import type { Order, OrderStatus, Product } from '../types';
import { useAuth } from '../auth/AuthContext';

const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Shipped', 'Cancelled'],
  Shipped: ['Completed'],
  Completed: [],
  Cancelled: [],
};

interface DraftLine {
  productId: number | '';
  quantity: number;
}

export default function OrdersPage() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: 1 }]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([getOrders(search || undefined), getProducts()]);
      setOrders(o);
      setProducts(p);
      setError(null);
    } catch {
      setError('Could not reach the API. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: 1 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function resetForm() {
    setCustomerName('');
    setLines([{ productId: '', quantity: 1 }]);
    setShowForm(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const items = lines
      .filter((l) => l.productId !== '')
      .map((l) => ({ productId: Number(l.productId), quantity: l.quantity }));

    if (items.length === 0) {
      setError('Add at least one product line.');
      return;
    }

    try {
      await createOrder({ customerName, items });
      resetForm();
      setError(null);
      await refresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to create order');
      setError(message);
    }
  }

  async function handleStatusChange(order: Order, status: OrderStatus) {
    try {
      await updateOrderStatus(order.id, status);
      await refresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to update status');
      setError(message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Orders</h1>
        <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New Order'}
        </button>
      </div>

      <input
        className="search-box"
        placeholder="Search by customer or order #…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {error && <p className="error-banner">{error}</p>}

      {showForm && (
        <form className="panel order-form" onSubmit={handleCreate}>
          <label>
            Customer Name
            <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>

          <div className="order-lines">
            <span className="minisub">Items</span>
            {lines.map((line, index) => (
              <div className="order-line" key={index}>
                <select
                  required
                  value={line.productId}
                  onChange={(e) => updateLine(index, { productId: e.target.value ? Number(e.target.value) : '' })}
                >
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.quantityOnHand} in stock)
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                />
                {lines.length > 1 && (
                  <button type="button" className="btn small danger" onClick={() => removeLine(index)}>Remove</button>
                )}
              </div>
            ))}
            <button type="button" className="btn small" onClick={addLine}>+ Add item</button>
          </div>

          <button className="btn primary" type="submit">Place Order</button>
        </form>
      )}

      {loading ? (
        <p>Loading orders…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td>
                <td>{o.customerName}</td>
                <td>{o.items.map((i) => `${i.productName} x${i.quantity}`).join(', ')}</td>
                <td>${o.totalAmount.toFixed(2)}</td>
                <td>
                  <span className={`status-badge status-${o.status.toLowerCase()}`}>{o.status}</span>
                </td>
                <td className="actions">
                  {NEXT_STATUS[o.status]
                    .filter((next) => next !== 'Cancelled' || isAdmin)
                    .map((next) => (
                      <button key={next} className="btn small" onClick={() => handleStatusChange(o, next)}>
                        Mark {next}
                      </button>
                    ))}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  {search ? 'No orders match your search.' : 'No orders yet. Place one above.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
