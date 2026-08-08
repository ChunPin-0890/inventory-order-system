import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getOrders } from "../api/orders";
import { getProducts } from "../api/products";
import type { Order, OrderStatus, Product } from "../types";

// Same palette used for the status badges elsewhere in the app, so the chart
// and the table rows read as one consistent visual language.
const STATUS_COLORS: Record<OrderStatus, string> = {
  Pending: "#f59e0b",
  Confirmed: "#3b82f6",
  Shipped: "#6366f1",
  Completed: "#22c55e",
  Cancelled: "#ef4444",
};

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
      .catch(() => setError("Could not reach the API. Is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  // Group total stock quantity by category — recharts wants a flat array of
  // { name, value } style objects, not the raw Product[] shape.
  const stockByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of products) {
      totals.set(
        p.categoryName,
        (totals.get(p.categoryName) ?? 0) + p.quantityOnHand,
      );
    }
    return Array.from(totals.entries()).map(([category, quantity]) => ({
      category,
      quantity,
    }));
  }, [products]);

  // Same idea for orders — count how many fall into each status bucket.
  const ordersByStatus = useMemo(() => {
    const counts = new Map<OrderStatus, number>();
    for (const o of orders) {
      counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([status, count]) => ({
      status,
      count,
    }));
  }, [orders]);

  if (loading) return <p>Loading dashboard…</p>;
  if (error) return <p className="error-banner">{error}</p>;

  const lowStock = products.filter((p) => p.isLowStock);
  const pendingOrders = orders.filter((o) => o.status === "Pending");
  const totalRevenue = orders
    .filter((o) => o.status !== "Cancelled")
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

      <div className="chart-grid">
        <section className="panel chart-panel">
          <h2>Stock by Category</h2>
          {stockByCategory.length === 0 ? (
            <p className="minisub">No products yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stockByCategory}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="category"
                  stroke="var(--color-muted)"
                  fontSize={12}
                />
                <YAxis
                  stroke="var(--color-muted)"
                  fontSize={12}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="quantity"
                  name="Units in stock"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="panel chart-panel">
          <h2>Orders by Status</h2>
          {ordersByStatus.length === 0 ? (
            <p className="minisub">No orders yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={ordersByStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry: unknown) => {
                    const { status, count } = entry as {
                      status: OrderStatus;
                      count: number;
                    };
                    return `${status} (${count})`;
                  }}
                >
                  {ordersByStatus.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLORS[entry.status]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {lowStock.length > 0 && (
        <section className="panel">
          <h2>⚠️ Low Stock Alert</h2>
          <ul className="simple-list">
            {lowStock.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> ({p.sku}) — {p.quantityOnHand} left
                (threshold {p.reorderThreshold})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
