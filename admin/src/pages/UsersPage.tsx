import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type UserSummary } from "../lib/api";

export function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchUsers = useCallback(
    async (startAfter?: string) => {
      const isLoadMore = !!startAfter;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await api.listUsers({
          limit: 50,
          startAfter,
          searchQuery: search || undefined,
        });
        setUsers((prev) => (isLoadMore ? [...prev, ...result.users] : result.users));
        setHasMore(result.hasMore);
      } catch (e) {
        console.error("Failed to fetch users:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = () => {
    setSearch(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const lastUid = users[users.length - 1]?.uid;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search by name or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn btn-primary" onClick={handleSearch}>
          Search
        </button>
        {search && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearchInput("");
              setSearch("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
          Loading users...
        </div>
      ) : users.length === 0 ? (
        <div className="empty-state">No users found</div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Clubs</th>
                  <th>Verified</th>
                  <th>Admin</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.uid} className="clickable" onClick={() => navigate(`/users/${user.uid}`)}>
                    <td style={{ fontWeight: 500 }}>{user.displayName || "-"}</td>
                    <td>{user.email}</td>
                    <td>{user.clubCount}</td>
                    <td>
                      <span className={`badge ${user.emailVerified ? "badge-success" : "badge-warning"}`}>
                        {user.emailVerified ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      {user.platformAdmin && <span className="badge badge-info">Admin</span>}
                    </td>
                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="load-more">
              <button className="btn btn-secondary" onClick={() => fetchUsers(lastUid)} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
