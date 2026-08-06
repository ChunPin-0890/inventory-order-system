import { useEffect, useState } from 'react';
import {
  adjustStock,
  createProduct,
  deactivateProduct,
  getProducts,
  reactivateProduct,
} from '../api/products';
import { createCategory, getCategories } from '../api/categories';
import type { Category, CreateProductRequest, Product } from '../types';
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
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit Price</th>
              <th>Qty on Hand</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={!p.isActive ? 'row-inactive' : p.isLowStock ? 'row-warning' : ''}>
                <td>{p.sku}</td>
                <td>{p.name}</td>
                <td>{p.categoryName}</td>
                <td>${p.unitPrice.toFixed(2)}</td>
                <td>{p.quantityOnHand}</td>
                <td>{!p.isActive ? 'Inactive' : p.isLowStock ? '⚠️ Low Stock' : 'OK'}</td>
                <td className="actions">
                  {isAuthenticated ? (
                    p.isActive ? (
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
                    )
                  ) : (
                    <span className="minisub">—</span>
                  )}
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">No products yet. Create one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
