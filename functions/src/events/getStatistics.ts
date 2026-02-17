import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    GetStatisticsRequest,
    GetStatisticsResponse,
    YearlyAttendanceStatistics,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Fetches yearly attendance statistics for a group
 *
 * Features:
 * - Retrieves statistics document for specified year
 * - Returns member-level and group-level aggregates
 * - Validates user has access to the group
 *
 * @param request - Contains clubId, groupId, and year
 * @returns Promise with statistics data
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Statistics document not found
 * @throws HttpsError('permission-denied') - User not authorized to view statistics
 */
export const getStatistics = onCall(
  { region: config.region },
  async (request): Promise<GetStatisticsResponse> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const data: GetStatisticsRequest = request.data;

      validateRequiredFields(data, ["clubId", "groupId", "year"]);

      const db = admin.firestore();
      const userId = request.auth.uid;

      console.log(
        `📊 Fetching statistics for group ${data.groupId}, year ${data.year}`,
      );

      // ============================================================================
      // STEP 2: Permission Validation
      // ============================================================================
      // Verify user has access to the group
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      const clubAccess = userData?.clubAccess?.find(
        (ca: any) => ca.clubId === data.clubId,
      );
      if (!clubAccess) {
        throw new HttpsError(
          "permission-denied",
          "You are not a member of this club",
        );
      }

      // Check if user is club-admin (full access to all groups in club)
      const isClubAdmin = clubAccess.role === "club-admin";

      if (!isClubAdmin) {
        // For non-club-admins, verify they are a member of the group
        const groupAccess = clubAccess.groupAccess?.find(
          (g: any) => g.groupId === data.groupId,
        );
        if (!groupAccess) {
          throw new HttpsError(
            "permission-denied",
            "You are not a member of this group",
          );
        }
      }

      // ============================================================================
      // STEP 3: Fetch Statistics Document
      // ============================================================================
      const statsRef = db
        .collection("clubs")
        .doc(data.clubId)
        .collection("groups")
        .doc(data.groupId)
        .collection("statistics")
        .doc(data.year.toString());

      const statsDoc = await statsRef.get();

      if (!statsDoc.exists) {
        return {
          success: false,
          message: `No statistics found for year ${data.year}`,
        };
      }

      const statistics = statsDoc.data() as YearlyAttendanceStatistics;

      console.log(`✅ Statistics retrieved successfully`);

      // ============================================================================
      // STEP 4: Return Statistics Data
      // ============================================================================
      return {
        success: true,
        statistics,
      };
    } catch (error: any) {
      console.error("❌ Error in getStatistics:", error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to fetch statistics: ${error.message}`,
      );
    }
  },
);
