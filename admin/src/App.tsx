import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./hooks/useAuth";
import { DashboardPage } from "./pages/DashboardPage";
import { ClubsPage } from "./pages/ClubsPage";
import { ClubDetailPage } from "./pages/ClubDetailPage";
import { UsersPage } from "./pages/UsersPage";
import { UserDetailPage } from "./pages/UserDetailPage";

export function App() {
  const { user, isPlatformAdmin, loading, error, login, logout } = useAuth();

  if (loading) {
    return (
      <div className="login-page">
        <div className="loading">
          <div className="spinner" />
          Loading...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={login} error={error} />;
  }

  if (!isPlatformAdmin) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="access-denied">
            <h2>Access Denied</h2>
            <p>Your account does not have platform admin privileges.</p>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout userEmail={user.email ?? ""} onLogout={logout}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clubs" element={<ClubsPage />} />
          <Route path="/clubs/:clubId" element={<ClubDetailPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/:uid" element={<UserDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
