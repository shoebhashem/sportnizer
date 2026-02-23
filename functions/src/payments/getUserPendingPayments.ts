import * as admin from "firebase-admin";
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
  dueDate: admin.firestore.Timestamp | null;
  isOverdue: boolean;
  daysRemaining: number | null;
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
      const notificationsQuery = await db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .where("type", "==", "payment_request")
        .where("status", "==", "pending")
        .get();

      const pendingPayments: PendingPayment[] = [];
      const now = new Date();

      for (const notificationDoc of notificationsQuery.docs) {
        const notification = notificationDoc.data();
        const data = notification.data || {};

        // Get club name (we may need to cache this for performance)
        let clubName = "Unknown Club";
        try {
          const clubDoc = await db.collection("clubs").doc(data.clubId).get();
          if (clubDoc.exists) {
            clubName = clubDoc.data()?.name || "Unknown Club";
          }
        } catch (e) {
          console.warn("Could not fetch club name:", e);
        }

        // Calculate due date status
        let isOverdue = false;
        let daysRemaining: number | null = null;

        if (data.dueDate) {
          const dueDate = data.dueDate.toDate
            ? data.dueDate.toDate()
            : new Date(data.dueDate);
          const timeDiff = dueDate.getTime() - now.getTime();
          daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          isOverdue = daysRemaining < 0;
        }

        pendingPayments.push({
          feeId: data.feeId,
          feeTitle: notification.title || data.title || "Membership Fee",
          beneficiaryId: data.beneficiaryId,
          beneficiaryName: data.beneficiaryName,
          clubId: data.clubId,
          clubName,
          groupId: data.groupId,
          groupName: data.groupName,
          amount: data.amount,
          currency: data.currency,
          dueDate: data.dueDate || null,
          isOverdue,
          daysRemaining,
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
