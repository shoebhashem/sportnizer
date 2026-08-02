import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ClubDetails } from "../lib/api";
import { JsonViewer } from "../components/JsonViewer";
import { Collapsible } from "../components/Collapsible";

export function ClubDetailPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [details, setDetails] = useState<ClubDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "groups" | "raw">("overview");

  useEffect(() => {
    if (!clubId) return;
    setLoading(true);
    api
      .getClubDetails({ clubId })
      .then(setDetails)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clubId]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading club details...
      </div>
    );
  }

  if (error || !details) {
    return <div className="error-text">Error: {error ?? "Club not found"}</div>;
  }

  const club = details.club;

  return (
    <div>
      <Link to="/clubs" className="back-link">
        &larr; Back to Clubs
      </Link>

      <div className="page-header">
        <h1 className="page-title">{String(club.name ?? "Unknown Club")}</h1>
        <span className={`badge ${club.isActive ? "badge-success" : "badge-danger"}`}>
          {club.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
          Overview
        </button>
        <button className={`tab ${activeTab === "members" ? "active" : ""}`} onClick={() => setActiveTab("members")}>
          Members ({details.members.length})
        </button>
        <button className={`tab ${activeTab === "groups" ? "active" : ""}`} onClick={() => setActiveTab("groups")}>
          Groups ({details.groups.length})
        </button>
        <button className={`tab ${activeTab === "raw" ? "active" : ""}`} onClick={() => setActiveTab("raw")}>
          Raw Data
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="detail-grid">
          <div className="detail-section">
            <h3>Club Info</h3>
            <DetailRow label="Club ID" value={clubId ?? ""} />
            <DetailRow label="Name" value={String(club.name ?? "")} />
            <DetailRow label="Location" value={String(club.location ?? "-")} />
            <DetailRow label="Address" value={String(club.address ?? "-")} />
            <DetailRow label="Phone" value={String(club.phoneNumber ?? "-")} />
            <DetailRow label="Description" value={String(club.description ?? "-")} />
            <DetailRow label="Created By" value={String(club.createdBy ?? "-")} />
            <DetailRow label="Member Count" value={String(club.memberCount ?? 0)} />
            <DetailRow label="Active Groups" value={String(club.activeGroupCount ?? 0)} />
          </div>

          <div className="detail-section">
            <h3>Subscription & Payments</h3>
            <DetailRow
              label="Subscription Tier"
              value={String((club.subscription as Record<string, unknown>)?.tier ?? "free")}
            />
            <DetailRow
              label="Stripe Status"
              value={String((club.stripe as Record<string, unknown>)?.status ?? "Not set up")}
            />
            <DetailRow
              label="Charges Enabled"
              value={String((club.stripe as Record<string, unknown>)?.chargesEnabled ?? "-")}
            />
          </div>

          <div className="detail-section">
            <h3>Counts</h3>
            <DetailRow label="Events" value={String(details.eventCount)} />
            <DetailRow label="News" value={String(details.newsCount)} />
            <DetailRow label="Groups" value={String(details.groups.length)} />
            <DetailRow label="Club Members" value={String(details.members.length)} />
          </div>

          {!!club.rf && (
            <div className="detail-section">
              <h3>RF Integration</h3>
              <DetailRow
                label="Organization Nr"
                value={String((club.rf as Record<string, unknown>).organizationNumber ?? "-")}
              />
              <DetailRow
                label="Integration Enabled"
                value={String((club.rf as Record<string, unknown>).integrationEnabled ?? false)}
              />
              <DetailRow label="Status" value={String((club.rf as Record<string, unknown>).setupStatus ?? "-")} />
            </div>
          )}
        </div>
      )}

      {activeTab === "members" && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {details.members.map((m) => (
                <tr
                  key={String(m.userId)}
                  className="clickable"
                  onClick={() => window.open(`/users/${String(m.userId)}`, "_blank")}
                >
                  <td style={{ fontWeight: 500 }}>{String(m.name ?? "-")}</td>
                  <td>{String(m.email ?? "-")}</td>
                  <td>
                    {Array.isArray(m.roles)
                      ? (m.roles as string[]).map((r) => (
                          <span key={r} className="badge badge-info" style={{ marginRight: 4 }}>
                            {r}
                          </span>
                        ))
                      : "-"}
                  </td>
                  <td>
                    <span className={`badge ${m.isActive !== false ? "badge-success" : "badge-danger"}`}>
                      {m.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, fontFamily: "monospace" }}>{String(m.userId ?? "")}</td>
                </tr>
              ))}
              {details.members.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No members
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "groups" && (
        <div>
          {details.groups.map((group) => (
            <Collapsible
              key={group.id}
              title={`${String(group.data.name ?? group.id)} (${group.members.length} members, ${group.subgroups.length} subgroups)`}
            >
              <div className="detail-grid" style={{ marginBottom: 12 }}>
                <div className="detail-section">
                  <h3>Group Info</h3>
                  <DetailRow label="Group ID" value={group.id} />
                  <DetailRow label="Name" value={String(group.data.name ?? "")} />
                  <DetailRow label="Sport" value={String(group.data.sportType ?? "-")} />
                  <DetailRow label="Active" value={String(group.data.isActive ?? true)} />
                </div>
              </div>

              {group.members.length > 0 && (
                <div className="table-container" style={{ marginBottom: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Roles</th>
                        <th>User ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.members.map((m) => (
                        <tr key={String(m.userId)}>
                          <td>{String(m.name ?? "-")}</td>
                          <td>
                            {Array.isArray(m.roles)
                              ? (m.roles as string[]).map((r) => (
                                  <span key={r} className="badge badge-info" style={{ marginRight: 4 }}>
                                    {r}
                                  </span>
                                ))
                              : "-"}
                          </td>
                          <td style={{ fontSize: 12, fontFamily: "monospace" }}>{String(m.userId ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {group.subgroups.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 13, marginBottom: 8, color: "var(--text-muted)" }}>Subgroups</h4>
                  {group.subgroups.map((sg) => (
                    <div key={String(sg.id)} className="detail-row">
                      <span>{String(sg.name ?? sg.id)}</span>
                      <span className="badge badge-muted">{String(sg.memberCount ?? 0)} members</span>
                    </div>
                  ))}
                </div>
              )}
            </Collapsible>
          ))}
          {details.groups.length === 0 && <div className="empty-state">No groups</div>}
        </div>
      )}

      {activeTab === "raw" && <JsonViewer data={details} />}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}
