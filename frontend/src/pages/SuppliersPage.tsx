import { useEffect, useState } from 'react';
import { createSupplier, getSuppliers } from '../api/suppliers';
import type { CreateSupplierRequest, Supplier } from '../types';
import { useAuth } from '../auth/AuthContext';

function emptyForm(): CreateSupplierRequest {
  return { name: '', contactName: '', email: '', phone: '' };
}

export default function SuppliersPage() {
  const { isAuthenticated } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateSupplierRequest>(emptyForm());

  async function refresh() {
    setLoading(true);
    try {
      setSuppliers(await getSuppliers());
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createSupplier(form);
      setForm(emptyForm());
      setShowForm(false);
      await refresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to create supplier');
      setError(message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Suppliers</h1>
        {isAuthenticated && (
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New Supplier'}
          </button>
        )}
      </div>

      {error && <p className="error-banner">{error}</p>}

      {showForm && (
        <form className="panel form-grid" onSubmit={handleCreate}>
          <label>
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Contact Name
            <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <button className="btn primary" type="submit">Create Supplier</button>
        </form>
      )}

      {loading ? (
        <p>Loading suppliers…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.contactName || '—'}</td>
                <td>{s.email || '—'}</td>
                <td>{s.phone || '—'}</td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-state">No suppliers yet. Create one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
