import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export interface DashboardStats {
  totalClubs: number;
  activeClubs: number;
  inactiveClubs: number;
  totalUsers: number;
  totalGroups: number;
  recentClubs: number;
  recentUsers: number;
}

export interface ClubSummary {
  id: string;
  name: string;
  memberCount: number;
  isActive: boolean;
  location: string;
  createdAt: string;
  createdBy: string;
  subscriptionTier: string | null;
  stripeStatus: string | null;
  activeGroupCount: number;
}

export interface UserSummary {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  clubCount: number;
  createdAt: string;
  platformAdmin: boolean;
  emailVerified: boolean;
}

export interface ClubDetails {
  club: Record<string, unknown>;
  members: Record<string, unknown>[];
  groups: {
    id: string;
    data: Record<string, unknown>;
    members: Record<string, unknown>[];
    subgroups: Record<string, unknown>[];
  }[];
  eventCount: number;
  newsCount: number;
}

export interface UserDetails {
  user: Record<string, unknown>;
  notificationCount: number;
}

function callable<Req, Res>(name: string) {
  return (data: Req) => httpsCallable<Req, Res>(functions, name)(data).then((r) => r.data);
}

// Response shapes from the Cloud Functions (they wrap data differently)
interface DashboardStatsResponse {
  success: boolean;
  stats: DashboardStats;
}

interface ClubDetailsResponse {
  success: boolean;
  club: Record<string, unknown>;
  clubMembers: Record<string, unknown>[];
  groups: Record<string, unknown>[];
  groupMembers: Record<string, Record<string, unknown>[]>;
  subgroups: Record<string, Record<string, unknown>[]>;
  eventCount: number;
  newsCount: number;
}

interface UserDetailsResponse {
  success: boolean;
  user: Record<string, unknown>;
  notificationsCount: number;
}

export const api = {
  getDashboardStats: (data: void) =>
    callable<void, DashboardStatsResponse>("adminGetDashboardStats")(data).then(
      (r) => r.stats,
    ),

  listClubs: callable<
    { limit?: number; startAfter?: string; searchQuery?: string },
    { clubs: ClubSummary[]; hasMore: boolean }
  >("adminListClubs"),

  getClubDetails: (data: { clubId: string }) =>
    callable<{ clubId: string }, ClubDetailsResponse>("adminGetClubDetails")(data).then(
      (r): ClubDetails => ({
        club: r.club,
        members: r.clubMembers,
        groups: (r.groups as Record<string, unknown>[]).map((g) => ({
          id: String(g.id),
          data: g,
          members: r.groupMembers[String(g.id)] ?? [],
          subgroups: r.subgroups[String(g.id)] ?? [],
        })),
        eventCount: r.eventCount,
        newsCount: r.newsCount,
      }),
    ),

  listUsers: callable<
    { limit?: number; startAfter?: string; searchQuery?: string },
    { users: UserSummary[]; hasMore: boolean }
  >("adminListUsers"),

  getUserDetails: (data: { uid: string }) =>
    callable<{ uid: string }, UserDetailsResponse>("adminGetUserDetails")(data).then(
      (r): UserDetails => ({
        user: r.user ?? {},
        notificationCount: r.notificationsCount,
      }),
    ),

  updateDocument: callable<
    { documentPath: string; data: Record<string, unknown>; operation: "update" | "delete" },
    { success: boolean; message: string }
  >("adminUpdateDocument"),
};
