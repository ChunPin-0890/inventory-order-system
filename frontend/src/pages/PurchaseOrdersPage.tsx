import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrders,
  markPurchaseOrderOrdered,
  receivePurchaseOrder,
} from '../api/purchaseOrders';
import { getSuppliers } from '../api/suppliers';
import { getProducts } from '../api/products';
import type { CreatePurchaseOrderRequest, PurchaseOrder, PurchaseOrderStatus, Product, Supplier } from '../types';
import { useAuth } from '../auth/AuthContext';

interface DraftLine {
  productId: number | '';
  quantity: number;
}

function emptyLines(): DraftLine[] {
  return [{ productId: '', quantity: 1 }];
}

const STATUS_FILTER_OPTIONS: { value: PurchaseOrderStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Ordered', label: 'Ordered' },
  { value: 'Received', label: 'Received' },
  { value: 'Cancelled', label: 'Cancelled' },
];

export default function PurchaseOrdersPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>('');

  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [expectedAt, setExpectedAt] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(emptyLines());

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<number, number>>({});

  const filteredPurchaseOrders = useMemo(
    () => (statusFilter ? purchaseOrders.filter((po) => po.status === statusFilter) : purchaseOrders),
    [purchaseOrders, statusFilter],
  );

  async function refresh() {
    setLoading(true);
    try {
      const [poList, supplierList, productList] = await Promise.all([
        getPurchaseOrders(),
        getSuppliers(),
        getProducts(),
      ]);
      setPurchaseOrders(poList);
      setSuppliers(supplierList);
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
  }, []);

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
    setSupplierId('');
    setExpectedAt('');
    setLines(emptyLines());
    setShowForm(false);
  }

  function extractMessage(err: unknown, fallback: string): string {
    return (
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      (err instanceof Error ? err.message : fallback)
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const items = lines
      .filter((l) => l.productId !== '')
      .map((l) => ({ productId: Number(l.productId), quantity: l.quantity }));

    if (supplierId === '' || items.length === 0) {
      setError('Choose a supplier and add at least one line item.');
      return;
    }

    const request: CreatePurchaseOrderRequest = {
      supplierId: Number(supplierId),
      expectedAt: expectedAt || null,
      items,
    };

    try {
      await createPurchaseOrder(request);
      resetForm();
      setError(null);
      await refresh();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Failed to create purchase order'));
    }
  }

  async function handleMarkOrdered(po: PurchaseOrder) {
    try {
      await markPurchaseOrderOrdered(po.id);
      await refresh();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Failed to mark as ordered'));
    }
  }

  async function handleCancel(po: PurchaseOrder) {
    if (!confirm(`Cancel purchase order ${po.poNumber}?`)) return;
    try {
      await cancelPurchaseOrder(po.id);
      await refresh();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Failed to cancel purchase order'));
    }
  }

  function toggleExpand(po: PurchaseOrder) {
    if (expandedId === po.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(po.id);
    const defaults: Record<number, number> = {};
    for (const item of po.items) {
      defaults[item.id] = Math.max(item.orderedQuantity - item.receivedQuantity, 0);
    }
    setReceiveQty(defaults);
  }

  async function handleReceive(po: PurchaseOrder) {
    const linesToReceive = po.items
      .map((item) => ({ purchaseOrderItemId: item.id, receivedQuantity: receiveQty[item.id] ?? 0 }))
      .filter((l) => l.receivedQuantity > 0);

    if (linesToReceive.length === 0) {
      setError('Enter a quantity greater than zero for at least one line.');
      return;
    }

    try {
      await receivePurchaseOrder(po.id, { lines: linesToReceive });
      setExpandedId(null);
      setError(null);
      await refresh();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Failed to receive stock'));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Purchase Orders</h1>
        <div className="header-actions">
          <label className="inline-select">
            Status:{' '}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PurchaseOrderStatus | '')}>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {isAuthenticated && (
            <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : '+ New PO'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {showForm && (
        <form className="panel order-form" onSubmit={handleCreate}>
          <label>
            Supplier
            <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Expected Date (optional)
            <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
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
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
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

          <button className="btn primary" type="submit">Create Purchase Order</button>
        </form>
      )}

      {loading ? (
        <p>Loading purchase orders…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>PO #</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Items</th>
              <th>Expected</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchaseOrders.map((po) => (
              <Fragment key={po.id}>
                <tr>
                  <td>{po.poNumber}</td>
                  <td>{po.supplierName}</td>
                  <td><span className={`status-badge status-${po.status.toLowerCase()}`}>{po.status}</span></td>
                  <td>{po.items.length}</td>
                  <td>{po.expectedAt ? new Date(po.expectedAt).toLocaleDateString() : '—'}</td>
                  <td className="actions">
                    {isAuthenticated ? (
                      <>
                        {po.status === 'Draft' && (
                          <button className="btn small" onClick={() => handleMarkOrdered(po)}>Mark Ordered</button>
                        )}
                        {po.status === 'Ordered' && (
                          <button className="btn small" onClick={() => toggleExpand(po)}>
                            {expandedId === po.id ? 'Close' : 'Receive'}
                          </button>
                        )}
                        {isAdmin && (po.status === 'Draft' || po.status === 'Ordered') && (
                          <button className="btn small danger" onClick={() => handleCancel(po)}>Cancel</button>
                        )}
                      </>
                    ) : (
                      <span className="minisub">—</span>
                    )}
                  </td>
                </tr>
                {expandedId === po.id && (
                  <tr>
                    <td colSpan={6}>
                      <div className="panel">
                        <span className="minisub">Receive stock for {po.poNumber}</span>
                        <div className="po-lines">
                          {po.items.map((item) => {
                            const outstanding = item.orderedQuantity - item.receivedQuantity;
                            return (
                              <div className="po-line-row" key={item.id}>
                                <span>{item.productName}</span>
                                <span className="minisub">Ordered {item.orderedQuantity}</span>
                                <span className="minisub">Received {item.receivedQuantity}</span>
                                <input
                                  type="number"
                                  min="0"
                                  max={outstanding}
                                  disabled={outstanding === 0}
                                  value={receiveQty[item.id] ?? 0}
                                  onChange={(e) =>
                                    setReceiveQty((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="po-receive-row">
                          <button className="btn primary" onClick={() => handleReceive(po)}>Receive Selected</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filteredPurchaseOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  {statusFilter ? `No ${statusFilter.toLowerCase()} purchase orders.` : 'No purchase orders yet. Create one above.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
