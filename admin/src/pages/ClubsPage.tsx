import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ClubSummary } from "../lib/api";

export function ClubsPage() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchClubs = useCallback(
    async (startAfter?: string) => {
      const isLoadMore = !!startAfter;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await api.listClubs({
          limit: 50,
          startAfter,
          searchQuery: search || undefined,
        });
        setClubs((prev) => (isLoadMore ? [...prev, ...result.clubs] : result.clubs));
        setHasMore(result.hasMore);
      } catch (e) {
        console.error("Failed to fetch clubs:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search],
  );

  useEffect(() => {
    fetchClubs();
  }, [fetchClubs]);

  const handleSearch = () => {
    setSearch(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const lastClubId = clubs[clubs.length - 1]?.id;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clubs</h1>
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search clubs by name..."
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
          Loading clubs...
        </div>
      ) : clubs.length === 0 ? (
        <div className="empty-state">No clubs found</div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Members</th>
                  <th>Groups</th>
                  <th>Status</th>
                  <th>Subscription</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((club) => (
                  <tr key={club.id} className="clickable" onClick={() => navigate(`/clubs/${club.id}`)}>
                    <td style={{ fontWeight: 600 }}>{club.name}</td>
                    <td>{club.location || "-"}</td>
                    <td>{club.memberCount}</td>
                    <td>{club.activeGroupCount ?? "-"}</td>
                    <td>
                      <span className={`badge ${club.isActive ? "badge-success" : "badge-danger"}`}>
                        {club.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-muted">{club.subscriptionTier ?? "free"}</span>
                    </td>
                    <td>{club.createdAt ? new Date(club.createdAt).toLocaleDateString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="load-more">
              <button className="btn btn-secondary" onClick={() => fetchClubs(lastClubId)} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
