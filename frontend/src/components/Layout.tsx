import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');

function NavLinks({ isAuthenticated, onNavigate }: { isAuthenticated: boolean; onNavigate?: () => void }) {
  return (
    <>
      {isAuthenticated && <NavLink to="/dashboard" className={navLinkClass} onClick={onNavigate}>Dashboard</NavLink>}
      <NavLink to="/products" className={navLinkClass} onClick={onNavigate}>Products</NavLink>
      {isAuthenticated && <NavLink to="/orders" className={navLinkClass} onClick={onNavigate}>Orders</NavLink>}
      {isAuthenticated && <NavLink to="/stock-movements" className={navLinkClass} onClick={onNavigate}>Stock Movements</NavLink>}
      {isAuthenticated && <NavLink to="/purchase-orders" className={navLinkClass} onClick={onNavigate}>Purchase Orders</NavLink>}
      {isAuthenticated && <NavLink to="/suppliers" className={navLinkClass} onClick={onNavigate}>Suppliers</NavLink>}
    </>
  );
}

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
          <div className="brand">📦 Inventory &amp; Order System</div>
        </div>
        <nav className="desktop-nav">
          <NavLinks isAuthenticated={isAuthenticated} />
        </nav>
        <div className="user-info">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {isAuthenticated ? (
            <>
              <span className="user-badge">{user?.username} · {user?.role}</span>
              <button className="btn small" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <span className="user-badge">Guest (view only)</span>
              <Link className="btn small primary" to="/login">Sign in</Link>
            </>
          )}
        </div>
      </header>

      {sidebarOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setSidebarOpen(false)}>
          <div className="mobile-sidebar-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sidebar-header">
              <div className="brand">📦 Menu</div>
              <button className="mobile-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">×</button>
            </div>
            <nav>
              <NavLinks isAuthenticated={isAuthenticated} onNavigate={() => setSidebarOpen(false)} />
            </nav>
          </div>
        </div>
      )}

      <main className="app-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        Portfolio project — React + TypeScript + .NET Web API + EF Core
      </footer>
    </div>
  );
}
