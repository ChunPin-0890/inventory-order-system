import { useEffect, useState } from 'react';
import { getProducts } from '../api/products';
import { getOrders } from '../api/orders';
import type { Order, Product } from '../types';

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getProducts(), getOrders()])
      .then(([p, o]) => {
        setProducts(p);
        setOrders(o);
      })
      .catch(() => setError('Could not reach the API. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading dashboard…</p>;
  if (error) return <p className="error-banner">{error}</p>;

  const lowStock = products.filter((p) => p.isLowStock);
  const pendingOrders = orders.filter((o) => o.status === 'Pending');
  const totalRevenue = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Products</span>
          <span className="stat-value">{products.length}</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-label">Low Stock Items</span>
          <span className="stat-value">{lowStock.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending Orders</span>
          <span className="stat-value">{pendingOrders.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Revenue (non-cancelled)</span>
          <span className="stat-value">${totalRevenue.toFixed(2)}</span>
        </div>
      </div>

      {lowStock.length > 0 && (
        <section className="panel">
          <h2>⚠️ Low Stock Alert</h2>
          <ul className="simple-list">
            {lowStock.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> ({p.sku}) — {p.quantityOnHand} left (threshold {p.reorderThreshold})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
