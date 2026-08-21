import { useEffect, useState } from 'react';
import { getStockMovements } from '../api/stockMovements';
import { getProducts } from '../api/products';
import type { Product, StockMovement, StockMovementType } from '../types';

const TYPE_OPTIONS: { value: StockMovementType | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'StockIn', label: 'Stock In' },
  { value: 'StockOut', label: 'Stock Out' },
  { value: 'Adjustment', label: 'Adjustment' },
];

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState<number | ''>('');
  const [type, setType] = useState<StockMovementType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const [movementList, productList] = await Promise.all([
        getStockMovements({
          productId: productId || undefined,
          type: type || undefined,
          from: from || undefined,
          to: to || undefined,
        }),
        getProducts(),
      ]);
      setMovements(movementList);
      setProducts(productList);
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
  }, [productId, type, from, to]);

  function reasonLabel(m: StockMovement): string {
    return m.reason || '—';
  }

  function quantityLabel(m: StockMovement): string {
    if (m.type === 'StockOut') return `−${m.quantity}`;
    if (m.type === 'StockIn') return `+${m.quantity}`;
    return `${m.quantity}`;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Stock Movements</h1>
      </div>

      <p className="minisub">
        Every change to stock — sales, cancellations, manual adjustments, and purchase order
        receipts — logged in one place, newest first.
      </p>

      {error && <p className="error-banner">{error}</p>}

      <div className="panel form-grid">
        <label>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as StockMovementType | '')}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p>Loading stock movements…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Product</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.createdAt).toLocaleString()}</td>
                <td>{m.productName}</td>
                <td><span className={`status-badge status-${m.type.toLowerCase()}`}>{m.type}</span></td>
                <td>{quantityLabel(m)}</td>
                <td>{reasonLabel(m)}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">No stock movements match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
