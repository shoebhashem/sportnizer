import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Pending payment item returned to the client
 */
interface PendingPayment {
  feeId: string;
  feeTitle: string;
  beneficiaryId: string;
  beneficiaryName: string;
  clubId: string;
  clubName: string;
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
  dueDate: Timestamp | null;
  isOverdue: boolean;
  daysRemaining: number | null;
  status: "pending" | "paid";
}

/**
 * Get all pending payments for a user and their dependents
 *
 * This function returns:
 * 1. Payment requests directly assigned to the user (they are the beneficiary)
 * 2. Payment requests for the user's dependents (child members)
 *
 * Used by the PaymentCard on the Home screen.
 */
export const getUserPendingPayments = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{
    success: boolean;
    pendingPayments: PendingPayment[];
    totalPending: number;
  }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const db = admin.firestore();

    try {
      // 2. Get user's dependents
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data()!;
      const dependents = userData.dependents || [];
      // Note: dependentIds would be used if we're querying by beneficiary directly
      // Currently we use notifications which already handle guardian relationships
      void dependents; // Suppress unused warning - may be used in future optimization

      // 3. Find all active payment notifications for the user
      // Query from user's notifications subcollection
      // Note: notifications use 'dismissed: false' instead of 'status: pending'
      const notificationsQuery = await db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .where("type", "==", "payment_request")
        .where("dismissed", "==", false)
        .get();

      const pendingPayments: PendingPayment[] = [];
      const now = new Date();

      for (const notificationDoc of notificationsQuery.docs) {
        const notification = notificationDoc.data();
        // Metadata contains fee-specific payment details (feeId, amount, etc.)
        // Club/group info is stored at notification root level
        const metadata = notification.metadata || {};

        // Safety-net: skip notifications whose fee has since been closed.
        // This covers edge cases where notification dismissal on close failed
        // or the notification pre-dates the dismiss-on-close logic.
        if (metadata.feeId) {
          const feeSnap = await db
            .collection("membershipFees")
            .doc(metadata.feeId)
            .get();
          if (feeSnap.exists && feeSnap.data()?.status === "closed") {
            // Opportunistically dismiss the stale notification so it won't
            // be returned in future calls either.
            notificationDoc.ref
              .update({ dismissed: true, read: true })
              .catch(() => {
                // best-effort — ignore errors
              });
            continue;
          }
        }

        // Club and group names are stored at notification root level by createMembershipFee
        const clubId = notification.clubId || metadata.clubId;
        const clubName = notification.clubName || "Unknown Club";
        const groupId = notification.groupId || metadata.groupId;
        const groupName = notification.groupName || "Unknown Group";

        // Calculate due date status
        let isOverdue = false;
        let daysRemaining: number | null = null;

        if (metadata.dueDate) {
          const dueDate = metadata.dueDate.toDate
            ? metadata.dueDate.toDate()
            : new Date(metadata.dueDate);
          const timeDiff = dueDate.getTime() - now.getTime();
          daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          isOverdue = daysRemaining < 0;
        }

        pendingPayments.push({
          feeId: metadata.feeId,
          feeTitle: notification.title || metadata.title || "Membership Fee",
          beneficiaryId: metadata.beneficiaryId,
          beneficiaryName: metadata.beneficiaryName,
          clubId,
          clubName,
          groupId,
          groupName,
          amount: metadata.amount,
          currency: metadata.currency,
          dueDate: metadata.dueDate || null,
          isOverdue,
          daysRemaining,
          status: "pending", // All non-dismissed notifications are pending
        });
      }

      // Sort by due date (most urgent first)
      pendingPayments.sort((a, b) => {
        // Overdue first
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;

        // Then by days remaining
        if (a.daysRemaining !== null && b.daysRemaining !== null) {
          return a.daysRemaining - b.daysRemaining;
        }

        return 0;
      });

      return {
        success: true,
        pendingPayments,
        totalPending: pendingPayments.length,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error fetching pending payments:", error);
      throw new HttpsError("internal", "Failed to fetch pending payments");
    }
  },
);
