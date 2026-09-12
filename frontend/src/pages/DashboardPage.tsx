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
  Pending: "#f5a623",
  Confirmed: "#60a5fa",
  Shipped: "#a78bfa",
  Completed: "#3dd68c",
  Cancelled: "#e05252",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** { current, previous } counts/sums over the trailing 7-day window vs. the 7 days before that. */
function windowedTrend<T>(
  items: T[],
  getDate: (item: T) => string,
  getValue: (item: T) => number,
) {
  const now = Date.now();
  let current = 0;
  let previous = 0;
  for (const item of items) {
    const age = now - new Date(getDate(item)).getTime();
    if (age < 0) continue;
    if (age <= 7 * DAY_MS) current += getValue(item);
    else if (age <= 14 * DAY_MS) previous += getValue(item);
  }
  return { current, previous, delta: current - previous };
}

function TrendRow({ delta, good, isCurrency = false }: { delta: number; good: boolean; isCurrency?: boolean }) {
  const up = delta >= 0;
  const magnitude = isCurrency ? `$${Math.abs(delta).toFixed(2)}` : String(Math.abs(delta));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span className={`stat-trend ${up ? "up" : "down"} ${good ? "good" : "bad"}`}>
        {up ? "↑" : "↓"} {up ? "+" : "−"}{magnitude}
      </span>
      <span className="stat-trend-note">vs last week</span>
    </div>
  );
}

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
  const nonCancelledOrders = orders.filter((o) => o.status !== "Cancelled");
  const totalRevenue = nonCancelledOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Real week-over-week deltas, derived from actual timestamps — not fabricated.
  // Low Stock has no historical snapshot (it's a live threshold check), so it
  // intentionally has no trend row rather than a faked one.
  const productsTrend = windowedTrend(products, (p) => p.createdAt, () => 1);
  const pendingTrend = windowedTrend(
    orders.filter((o) => o.status === "Pending"),
    (o) => o.createdAt,
    () => 1,
  );
  const revenueTrend = windowedTrend(nonCancelledOrders, (o) => o.createdAt, (o) => o.totalAmount);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Products</span>
          <span className="stat-value">{products.length}</span>
          <TrendRow delta={productsTrend.delta} good={productsTrend.delta >= 0} />
        </div>
        <div className="stat-card warning">
          <span className="stat-label">Low Stock Items</span>
          <span className="stat-value">{lowStock.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending Orders</span>
          <span className="stat-value">{pendingOrders.length}</span>
          <TrendRow delta={pendingTrend.delta} good={pendingTrend.delta <= 0} />
        </div>
        <div className="stat-card">
          <span className="stat-label">Revenue (non-cancelled)</span>
          <span className="stat-value">${totalRevenue.toFixed(2)}</span>
          <TrendRow delta={revenueTrend.delta} good={revenueTrend.delta >= 0} isCurrency />
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
                  fill="#f5a623"
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
