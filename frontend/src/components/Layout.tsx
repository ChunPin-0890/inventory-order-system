import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">📦 Inventory &amp; Order System</div>
        <nav>
          {isAuthenticated && <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>}
          <NavLink to="/products" className={navLinkClass}>Products</NavLink>
          {isAuthenticated && <NavLink to="/orders" className={navLinkClass}>Orders</NavLink>}
        </nav>
        {isAuthenticated ? (
          <div className="user-info">
            <span className="user-badge">{user?.username} · {user?.role}</span>
            <button className="btn small" onClick={handleLogout}>Log out</button>
          </div>
        ) : (
          <div className="user-info">
            <span className="user-badge">Guest (view only)</span>
            <Link className="btn small primary" to="/login">Sign in</Link>
          </div>
        )}
      </header>
      <main className="app-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        Portfolio project — React + TypeScript + .NET Web API + EF Core
      </footer>
    </div>
  );
}
