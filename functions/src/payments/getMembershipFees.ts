import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Membership fee summary for club admin view
 */
interface MembershipFeeSummary {
  feeId: string;
  title: string;
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
  dueDate: Timestamp | null;
  status: "active" | "closed";
  totalExpected: number;
  totalPaid: number;
  percentPaid: number;
  createdAt: Timestamp;
}

/**
 * Get membership fees for a club
 *
 * Returns all membership fees for the club with payment progress.
 * Used by club admins to track payment status.
 *
 * SECURITY: Only club members can view fees for groups they're in.
 * Club admin can view all fees for the club.
 */
export const getMembershipFees = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{
    success: boolean;
    fees: MembershipFeeSummary[];
  }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { clubId, groupId, status } = request.data;

    if (!clubId) {
      throw new HttpsError("invalid-argument", "Club ID is required");
    }

    const db = admin.firestore();

    try {
      // 2. Check user's access to this club
      const userDoc = await db.collection("users").doc(request.auth.uid).get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      const userClubAccess = clubAccess.find(
        (access: { clubId: string }) => access.clubId === clubId,
      );

      if (!userClubAccess) {
        throw new HttpsError(
          "permission-denied",
          "You don't have access to this club",
        );
      }

      const isClubAdmin = userClubAccess.role === "club-admin";

      // 3. Build query
      let query = db.collection("membershipFees").where("clubId", "==", clubId);

      // Filter by group if specified
      if (groupId) {
        // If not club admin, verify user is member of this group
        if (!isClubAdmin) {
          const groupAccess = userData?.groupAccess || [];
          const hasGroupAccess = groupAccess.some(
            (g: { groupId: string }) => g.groupId === groupId,
          );

          if (!hasGroupAccess) {
            throw new HttpsError(
              "permission-denied",
              "You don't have access to this group",
            );
          }
        }

        query = query.where("groupId", "==", groupId);
      } else if (!isClubAdmin) {
        // Non-admins can only see fees for groups they're in
        const groupAccess = userData?.groupAccess || [];
        const userGroupIds = groupAccess
          .filter((g: { clubId: string }) => g.clubId === clubId)
          .map((g: { groupId: string }) => g.groupId);

        if (userGroupIds.length === 0) {
          return { success: true, fees: [] };
        }

        // Firestore 'in' query limited to 10 items
        if (userGroupIds.length > 10) {
          // For users with many groups, we'll need to do multiple queries
          // For now, just use the first 10
          console.warn(
            "User has more than 10 groups, fee query may be incomplete",
          );
        }

        query = query.where("groupId", "in", userGroupIds.slice(0, 10));
      }

      // Filter by status if specified
      if (status === "active" || status === "closed") {
        query = query.where("status", "==", status);
      }

      // Execute query
      const feesSnapshot = await query.orderBy("createdAt", "desc").get();

      const fees: MembershipFeeSummary[] = feesSnapshot.docs.map((doc) => {
        const data = doc.data();
        const percentPaid =
          data.totalExpected > 0
            ? Math.round((data.totalPaid / data.totalExpected) * 100)
            : 0;

        return {
          feeId: doc.id,
          title: data.title,
          groupId: data.groupId,
          groupName: data.groupName,
          amount: data.amount,
          currency: data.currency,
          dueDate: data.dueDate,
          status: data.status,
          totalExpected: data.totalExpected,
          totalPaid: data.totalPaid,
          percentPaid,
          createdAt: data.createdAt,
        };
      });

      return {
        success: true,
        fees,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error fetching membership fees:", error);
      throw new HttpsError("internal", "Failed to fetch membership fees");
    }
  },
);
