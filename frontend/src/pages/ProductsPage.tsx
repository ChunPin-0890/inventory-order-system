import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adjustStock,
  createProduct,
  deactivateProduct,
  getProducts,
  reactivateProduct,
} from '../api/products';
import { createCategory, getCategories } from '../api/categories';
import { generateProductDescription } from '../api/ai';
import { getStockMovements } from '../api/stockMovements';
import type { Category, CreateProductRequest, Product, StockMovement } from '../types';
import { useAuth } from '../auth/AuthContext';

function emptyForm(categoryId: number): CreateProductRequest {
  return {
    sku: '',
    name: '',
    description: '',
    categoryId,
    unitPrice: 0,
    quantityOnHand: 0,
    reorderThreshold: 10,
  };
}

// The schema has no explicit "max stock" field, so the stock-level bar treats
// 3x the reorder threshold as an implicit healthy ceiling — a display heuristic,
// not a stored value. Thresholds (10%/30% of that ceiling) mirror the Figma spec.
function stockLevel(quantityOnHand: number, reorderThreshold: number) {
  const max = Math.max(reorderThreshold * 3, 1);
  const pct = Math.min(100, (quantityOnHand / max) * 100);
  if (quantityOnHand === 0 || pct < 10) return { pct, label: 'Critical', className: 'critical' };
  if (pct < 30) return { pct, label: 'Low', className: 'low' };
  return { pct, label: 'Healthy', className: 'healthy' };
}

const STOCK_BAR_COLOR: Record<string, string> = {
  critical: '#e05252',
  low: '#f5a623',
  healthy: '#3dd68c',
};

const MOVEMENT_DOT_COLOR: Record<string, string> = {
  StockIn: '#3dd68c',
  StockOut: '#e05252',
  Adjustment: '#60a5fa',
};

function ProductDetailDrawer({ product, onClose }: { product: Product; onClose: () => void }) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const level = stockLevel(product.quantityOnHand, product.reorderThreshold);

  useEffect(() => {
    let cancelled = false;
    setLoadingMovements(true);
    getStockMovements({ productId: product.id })
      .then((data) => {
        if (!cancelled) setMovements(data.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMovements(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{product.name}</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="drawer-body">
          <div>
            <div className="drawer-field-label">SKU</div>
            <div className="mono">{product.sku}</div>
          </div>
          <div>
            <div className="drawer-field-label">Category</div>
            <div>{product.categoryName}</div>
          </div>
          {product.description && (
            <div>
              <div className="drawer-field-label">Description</div>
              <div>{product.description}</div>
            </div>
          )}
          <div>
            <div className="drawer-field-label">Unit Price</div>
            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              ${product.unitPrice.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="drawer-field-label">Stock Level</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                {product.quantityOnHand}
              </span>
              <span className="minisub">/ {product.reorderThreshold * 3} units (est.)</span>
            </div>
            <div className="stock-level">
              <div className="stock-bar-track">
                <div
                  className="stock-bar-fill"
                  style={{ width: `${level.pct}%`, background: STOCK_BAR_COLOR[level.className] }}
                />
              </div>
              <span className={`stock-pill ${level.className}`}>{level.label}</span>
            </div>
          </div>
          <div>
            <div className="drawer-field-label">Recent Movements</div>
            {loadingMovements ? (
              <p className="minisub">Loading…</p>
            ) : movements.length === 0 ? (
              <p className="minisub">No movements recorded.</p>
            ) : (
              movements.map((m) => (
                <div key={m.id} className="drawer-movement-row">
                  <div className="drawer-movement-dot" style={{ background: MOVEMENT_DOT_COLOR[m.type] }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem' }}>{m.reason || m.type}</div>
                    <div className="mono minisub" style={{ fontSize: '0.7rem' }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className="mono"
                    style={{ fontSize: '0.8rem', fontWeight: 600, color: m.quantity > 0 ? '#3dd68c' : '#e05252' }}
                  >
                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateProductRequest>(emptyForm(0));
  const [showForm, setShowForm] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [productList, categoryList] = await Promise.all([
        getProducts({ includeInactive: isAdmin && showInactive }),
        getCategories(),
      ]);
      setProducts(productList);
      setCategories(categoryList);
      setForm((f) => (f.categoryId ? f : { ...f, categoryId: categoryList[0]?.id ?? 0 }));
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
  }, [showInactive]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createProduct(form);
      setForm(emptyForm(categories[0]?.id ?? 0));
      setShowForm(false);
      await refresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to create product');
      setError(message);
    }
  }

  async function handleGenerateDescription() {
    if (!form.name.trim()) {
      setError('Enter a product name first so the AI has something to describe.');
      return;
    }
    const categoryName = categories.find((c) => c.id === form.categoryId)?.name ?? '';
    setGeneratingDescription(true);
    try {
      const description = await generateProductDescription({
        productName: form.name,
        categoryName,
      });
      setForm((f) => ({ ...f, description }));
      setError(null);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to generate description');
      setError(message);
    } finally {
      setGeneratingDescription(false);
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      const category = await createCategory(newCategoryName.trim());
      setNewCategoryName('');
      setShowNewCategory(false);
      const updated = await getCategories();
      setCategories(updated);
      setForm((f) => ({ ...f, categoryId: category.id }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
    }
  }

  async function handleAdjust(product: Product, delta: number) {
    try {
      await adjustStock(product.id, delta, delta > 0 ? 'Manual restock' : 'Manual deduction');
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to adjust stock');
    }
  }

  async function handleDeactivate(product: Product) {
    if (!confirm(`Deactivate "${product.name}"? It will be hidden but its history is kept.`)) return;
    await deactivateProduct(product.id);
    await refresh();
  }

  async function handleReactivate(product: Product) {
    await reactivateProduct(product.id);
    await refresh();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Products</h1>
        <div className="header-actions">
          {isAdmin && (
            <label className="inline-checkbox">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          )}
          {isAuthenticated && (
            <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : '+ New Product'}
            </button>
          )}
        </div>
      </div>

      {!isAuthenticated && (
        <p className="info-banner">
          You're viewing as a guest. <a href="/login">Sign in</a> to add products, adjust stock, or place orders.
        </p>
      )}

      {error && <p className="error-banner">{error}</p>}

      {showForm && (
        <form className="panel form-grid" onSubmit={handleCreate}>
          <label>
            SKU
            <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </label>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="description-field">
            Description
            <div className="description-row">
              <textarea
                rows={2}
                value={form.description}
                placeholder="Optional — write your own, or generate one with AI"
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <button
                type="button"
                className="btn small"
                onClick={handleGenerateDescription}
                disabled={generatingDescription}
              >
                {generatingDescription ? 'Generating…' : '✨ Generate'}
              </button>
            </div>
          </label>
          <label>
            Category
            <select
              required
              value={form.categoryId || ''}
              onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}
            >
              <option value="" disabled>Select a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Unit Price
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
            />
          </label>
          <label>
            Initial Quantity
            <input
              required
              type="number"
              min="0"
              value={form.quantityOnHand}
              onChange={(e) => setForm({ ...form, quantityOnHand: Number(e.target.value) })}
            />
          </label>
          <label>
            Reorder Threshold
            <input
              required
              type="number"
              min="0"
              value={form.reorderThreshold}
              onChange={(e) => setForm({ ...form, reorderThreshold: Number(e.target.value) })}
            />
          </label>
          <button className="btn primary" type="submit">Create Product</button>

          <div className="new-category-row">
            {showNewCategory ? (
              <>
                <input
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <button type="button" className="btn small" onClick={handleAddCategory}>Add</button>
                <button type="button" className="btn small" onClick={() => setShowNewCategory(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="btn small" onClick={() => setShowNewCategory(true)}>
                + New category
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <p>Loading products…</p>
      ) : (
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit Price</th>
              <th>Stock Level</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const level = stockLevel(p.quantityOnHand, p.reorderThreshold);
              return (
              <tr
                key={p.id}
                className={!p.isActive ? 'row-inactive' : p.isLowStock ? 'row-warning' : ''}
                onClick={() => setSelectedProduct(p)}
                style={{ cursor: 'pointer' }}
              >
                <td className="mono nowrap">{p.sku}</td>
                <td className="nowrap">{p.name}</td>
                <td className="nowrap">{p.categoryName}</td>
                <td className="mono nowrap">${p.unitPrice.toFixed(2)}</td>
                <td>
                  <div className="stock-level">
                    <span className="mono" style={{ minWidth: 28, display: 'inline-block' }}>{p.quantityOnHand}</span>
                    <div className="stock-bar-track">
                      <div
                        className="stock-bar-fill"
                        style={{ width: `${level.pct}%`, background: STOCK_BAR_COLOR[level.className] }}
                      />
                    </div>
                    <span className={`stock-pill ${level.className}`}>{level.label}</span>
                  </div>
                </td>
                <td>{!p.isActive ? 'Inactive' : p.isLowStock ? '⚠️ Low Stock' : 'OK'}</td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>
                  {isAuthenticated ? (
                    <>
                      <Link className="btn small" to={`/stock-movements?productId=${p.id}`}>History</Link>
                      {p.isActive ? (
                        <>
                          <button className="btn small" onClick={() => handleAdjust(p, 10)}>+10</button>
                          <button className="btn small" onClick={() => handleAdjust(p, -1)}>-1</button>
                          {isAdmin && (
                            <button className="btn small danger" onClick={() => handleDeactivate(p)}>Deactivate</button>
                          )}
                        </>
                      ) : (
                        isAdmin && (
                          <button className="btn small" onClick={() => handleReactivate(p)}>Reactivate</button>
                        )
                      )}
                    </>
                  ) : (
                    <span className="minisub">—</span>
                  )}
                </td>
              </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">No products yet. Create one above.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
      {selectedProduct && (
        <ProductDetailDrawer product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  );
}
