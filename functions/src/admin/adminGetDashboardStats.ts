import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { requirePlatformAdmin } from "./requirePlatformAdmin";

interface DashboardStats {
  totalClubs: number;
  activeClubs: number;
  inactiveClubs: number;
  totalUsers: number;
  totalGroups: number;
  recentClubs: number; // created in the last 30 days
  recentUsers: number; // created in the last 30 days
}

interface AdminGetDashboardStatsResponse {
  success: boolean;
  stats: DashboardStats;
  generatedAt: string;
  error?: string;
}

/**
 * Returns aggregate platform statistics for the admin dashboard.
 *
 * Counts are computed on-the-fly from Firestore.  For collections that
 * may grow very large, consider replacing these with counter documents
 * or scheduled aggregation in the future.
 */
export const adminGetDashboardStats = onCall(
  { region: config.region },
  async (request): Promise<AdminGetDashboardStatsResponse> => {
    try {
      await requirePlatformAdmin(request);

      const db = admin.firestore();

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoTimestamp =
        admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

      // Run all aggregate queries in parallel.
      const [
        activeClubsSnap,
        inactiveClubsSnap,
        totalUsersSnap,
        totalGroupsSnap,
        recentClubsSnap,
        recentUsersSnap,
      ] = await Promise.all([
        // Active clubs
        db
          .collection("clubs")
          .where("isActive", "==", true)
          .select()
          .get(),
        // Inactive clubs (explicitly false; docs without the field are active)
        db
          .collection("clubs")
          .where("isActive", "==", false)
          .select()
          .get(),
        // Total users
        db.collection("users").select().get(),
        // Total groups (via collectionGroup)
        db.collectionGroup("groups").select().get(),
        // Clubs created in the last 30 days
        db
          .collection("clubs")
          .where("createdAt", ">=", thirtyDaysAgoTimestamp)
          .select()
          .get(),
        // Users created in the last 30 days
        db
          .collection("users")
          .where("createdAt", ">=", thirtyDaysAgoTimestamp)
          .select()
          .get(),
      ]);

      const activeClubs = activeClubsSnap.size;
      const inactiveClubs = inactiveClubsSnap.size;

      const stats: DashboardStats = {
        totalClubs: activeClubs + inactiveClubs,
        activeClubs,
        inactiveClubs,
        totalUsers: totalUsersSnap.size,
        totalGroups: totalGroupsSnap.size,
        recentClubs: recentClubsSnap.size,
        recentUsers: recentUsersSnap.size,
      };

      return {
        success: true,
        stats,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error in adminGetDashboardStats:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to get dashboard stats");
    }
  },
);
