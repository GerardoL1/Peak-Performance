import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../api/labels';

const NAV: { to: string; label: string; permission: string }[] = [
  { to: '/', label: 'Dashboard', permission: 'dashboard:read' },
  { to: '/members', label: 'Members', permission: 'members:read' },
  { to: '/checkins', label: 'Check-ins', permission: 'checkins:read' },
  { to: '/schedule', label: 'Class schedule', permission: 'classes:read' },
  { to: '/reservations', label: 'Reservations', permission: 'reservations:read' },
  { to: '/training', label: 'Training', permission: 'training:read' },
  { to: '/therapy', label: 'Therapy', permission: 'therapy:read' },
  { to: '/classes', label: 'Classes', permission: 'classes:read' },
  { to: '/staff', label: 'Staff', permission: 'staff:read' },
  { to: '/facilities', label: 'Facilities', permission: 'catalog:read' },
  { to: '/plans', label: 'Plans', permission: 'catalog:read' },
  { to: '/users', label: 'User accounts', permission: 'users:manage' },
];

export function Layout() {
  const { user, can, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="topbar">
        <button
          type="button"
          className="menu-button"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span aria-hidden="true">☰</span>
          <span className="sr-only">Menu</span>
        </button>
        <div className="brand">
          <span className="brand-name">Peak Performance</span>
          <span className="brand-sub">Fitness Center</span>
        </div>
        <div className="user-box">
          <span>
            {user?.DisplayName} <span className="badge badge-navy">{ROLE_LABEL[user?.Role ?? '']}</span>
          </span>
          <button type="button" className="button button-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav id="sidebar" className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Main">
        <ul>
          {NAV.filter((n) => can(n.permission)).map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.to === '/'} onClick={() => setMenuOpen(false)}>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <main id="main" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {count !== undefined && <span className="count-badge">{count} total</span>}
      <div className="page-actions">{children}</div>
    </div>
  );
}

/** Wraps a page that needs a permission the user lacks. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="empty-state">
        <h1>Not available</h1>
        <p>Your account does not have access to this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
