import { useEffect, useState } from "react";
import { api, type DashboardStats } from "../lib/api";

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDashboardStats(undefined as unknown as void)
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return <div className="error-text">Error: {error}</div>;
  }

  if (!stats) return null;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.totalClubs}</div>
          <div className="stat-label">Total Clubs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.activeClubs}</div>
          <div className="stat-label">Active Clubs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.inactiveClubs}</div>
          <div className="stat-label">Inactive Clubs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalUsers}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalGroups}</div>
          <div className="stat-label">Total Groups</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.recentClubs}</div>
          <div className="stat-label">New Clubs (30d)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.recentUsers}</div>
          <div className="stat-label">New Users (30d)</div>
        </div>
      </div>
    </div>
  );
}
