import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
  userEmail: string;
  onLogout: () => void;
}

export function Layout({ children, userEmail, onLogout }: LayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span>Clubnizer Admin</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/clubs" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Clubs</span>
          </NavLink>
          <NavLink to="/users" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <span>Users</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: 6, opacity: 0.7, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
            <span>{userEmail}</span>
          </div>
          <button onClick={onLogout}>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
