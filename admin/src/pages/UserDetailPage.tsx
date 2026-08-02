import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type UserDetails } from "../lib/api";
import { JsonViewer } from "../components/JsonViewer";

export function UserDetailPage() {
  const { uid } = useParams<{ uid: string }>();
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "access" | "raw">("overview");

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    api
      .getUserDetails({ uid })
      .then(setDetails)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [uid]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading user details...
      </div>
    );
  }

  if (error || !details) {
    return <div className="error-text">Error: {error ?? "User not found"}</div>;
  }

  const user = details.user;
  const clubAccess = (user.clubAccess as Record<string, unknown>[]) ?? [];

  return (
    <div>
      <Link to="/users" className="back-link">
        &larr; Back to Users
      </Link>

      <div className="page-header">
        <h1 className="page-title">{String(user.displayName ?? "Unknown User")}</h1>
        {!!user.platformAdmin && <span className="badge badge-info">Platform Admin</span>}
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
          Overview
        </button>
        <button className={`tab ${activeTab === "access" ? "active" : ""}`} onClick={() => setActiveTab("access")}>
          Club Access ({clubAccess.length})
        </button>
        <button className={`tab ${activeTab === "raw" ? "active" : ""}`} onClick={() => setActiveTab("raw")}>
          Raw Data
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="detail-grid">
          <div className="detail-section">
            <h3>User Info</h3>
            <DetailRow label="UID" value={uid ?? ""} />
            <DetailRow label="Display Name" value={String(user.displayName ?? "-")} />
            <DetailRow label="Email" value={String(user.email ?? "-")} />
            <DetailRow label="Phone" value={String(user.phoneNumber ?? "-")} />
            <DetailRow label="Email Verified" value={String(user.emailVerified ?? false)} />
            <DetailRow label="Platform Admin" value={String(user.platformAdmin ?? false)} />
            <DetailRow label="Photo URL" value={String(user.photoURL ?? "-")} />
          </div>

          <div className="detail-section">
            <h3>Activity</h3>
            <DetailRow
              label="Created"
              value={user.createdAt ? new Date(String(user.createdAt)).toLocaleString() : "-"}
            />
            <DetailRow
              label="Last Active"
              value={user.lastActive ? new Date(String(user.lastActive)).toLocaleString() : "-"}
            />
            <DetailRow label="Notifications" value={String(details.notificationCount)} />
            <DetailRow label="Version" value={String(user.version ?? "-")} />
          </div>

          <div className="detail-section">
            <h3>Flat Role Arrays</h3>
            <DetailRow
              label="Admin of Clubs"
              value={Array.isArray(user.adminOfClubs) ? String((user.adminOfClubs as string[]).length) : "0"}
            />
            <DetailRow
              label="Member of Clubs"
              value={Array.isArray(user.memberOfClubs) ? String((user.memberOfClubs as string[]).length) : "0"}
            />
            <DetailRow
              label="Admin of Groups"
              value={Array.isArray(user.adminOfGroups) ? String((user.adminOfGroups as string[]).length) : "0"}
            />
            <DetailRow
              label="Coach of Groups"
              value={Array.isArray(user.coachOfGroups) ? String((user.coachOfGroups as string[]).length) : "0"}
            />
            <DetailRow
              label="Member of Groups"
              value={Array.isArray(user.memberOfGroups) ? String((user.memberOfGroups as string[]).length) : "0"}
            />
            <DetailRow
              label="Guardian of Groups"
              value={Array.isArray(user.guardianOfGroups) ? String((user.guardianOfGroups as string[]).length) : "0"}
            />
          </div>

          {Array.isArray(user.dependents) && (user.dependents as unknown[]).length > 0 && (
            <div className="detail-section">
              <h3>Dependents (Youth Members)</h3>
              {(user.dependents as Record<string, unknown>[]).map((dep) => (
                <DetailRow key={String(dep.uid)} label={String(dep.childName ?? "")} value={String(dep.uid ?? "")} />
              ))}
            </div>
          )}

          {Array.isArray(user.guardians) && (user.guardians as unknown[]).length > 0 && (
            <div className="detail-section">
              <h3>Guardians</h3>
              {(user.guardians as Record<string, unknown>[]).map((g) => (
                <DetailRow key={String(g.uid)} label={String(g.name ?? "")} value={String(g.email ?? "")} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "access" && (
        <div>
          {clubAccess.length === 0 ? (
            <div className="empty-state">No club access</div>
          ) : (
            clubAccess.map((ca) => (
              <div key={String(ca.clubId)} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <Link to={`/clubs/${String(ca.clubId)}`} style={{ fontWeight: 600, color: "var(--primary)" }}>
                    {String(ca.clubName ?? ca.clubId)}
                  </Link>
                  <span className={`badge ${ca.isActive !== false ? "badge-success" : "badge-danger"}`}>
                    {String(ca.role ?? "-")}
                  </span>
                </div>
                {Array.isArray(ca.groupAccess) && (ca.groupAccess as Record<string, unknown>[]).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Groups:</div>
                    {(ca.groupAccess as Record<string, unknown>[]).map((ga) => (
                      <div key={String(ga.groupId)} className="detail-row">
                        <span>{String(ga.groupName ?? ga.groupId)}</span>
                        <span>
                          {Array.isArray(ga.roles)
                            ? (ga.roles as string[]).map((r) => (
                                <span key={r} className="badge badge-info" style={{ marginRight: 4 }}>
                                  {r}
                                </span>
                              ))
                            : "-"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
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
