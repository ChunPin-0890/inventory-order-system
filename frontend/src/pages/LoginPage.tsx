import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch {
      setError('Invalid username or password.');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(role: 'admin' | 'staff') {
    setUsername(role);
    setPassword(role === 'admin' ? 'Admin123!' : 'Staff123!');
  }

  return (
    <div className="login-shell">
      <form className="panel login-card" onSubmit={handleSubmit}>
        <h1>📦 Sign in</h1>
        <p className="boxsub">Inventory &amp; Order System</p>

        {error && <p className="error-banner">{error}</p>}

        <label>
          Username
          <input required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <button className="btn primary" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="demo-accounts">
          <span className="minisub">Demo accounts:</span>
          <button type="button" className="btn small" onClick={() => fillDemo('admin')}>Use Admin</button>
          <button type="button" className="btn small" onClick={() => fillDemo('staff')}>Use Staff</button>
        </div>
      </form>
    </div>
  );
}
