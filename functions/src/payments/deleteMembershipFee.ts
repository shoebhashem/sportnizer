import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Soft-delete (close) a membership fee.
 *
 * Sets status = "closed" and records deletedAt so the fee is retained
 * for accounting / audit purposes.
 *
 * Also dismisses all undismissed payment_request notifications that
 * reference this fee, so unpaid members' fee cards disappear from the
 * home screen immediately without requiring a manual action.
 *
 * SECURITY: Only the club-admin of the fee's club may close it.
 */
export const deleteMembershipFee = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { feeId } = request.data;

    if (!feeId || typeof feeId !== "string") {
      throw new HttpsError("invalid-argument", "feeId is required");
    }

    const db = admin.firestore();

    const feeRef = db.collection("membershipFees").doc(feeId);
    const feeDoc = await feeRef.get();

    if (!feeDoc.exists) {
      throw new HttpsError("not-found", "Fee not found");
    }

    const fee = feeDoc.data()!;

    // Verify caller is club-admin of this fee's club
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a) => a.clubId === fee.clubId);

    if (!access || access.role !== "club-admin") {
      throw new HttpsError(
        "permission-denied",
        "Only club admins may close fees",
      );
    }

    // 1. Mark the fee as closed
    await feeRef.update({
      status: "closed",
      deletedAt: FieldValue.serverTimestamp(),
      lastModifiedAt: FieldValue.serverTimestamp(),
    });

    // 2. Dismiss all undismissed payment_request notifications for this fee.
    //    Uses a COLLECTION_GROUP query so both direct members and guardians
    //    (who receive notifications in their own user doc) are covered in one sweep.
    try {
      const notifSnap = await db
        .collectionGroup("notifications")
        .where("type", "==", "payment_request")
        .where("dismissed", "==", false)
        .where("metadata.feeId", "==", feeId)
        .get();

      if (!notifSnap.empty) {
        // Firestore batches are limited to 500 writes each
        const BATCH_SIZE = 500;
        for (let i = 0; i < notifSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const chunk = notifSnap.docs.slice(i, i + BATCH_SIZE);
          for (const doc of chunk) {
            batch.update(doc.ref, {
              dismissed: true,
              read: true,
              dismissedAt: FieldValue.serverTimestamp(),
            });
          }
          await batch.commit();
        }
      }
    } catch (err) {
      // Log but don't fail the close operation — notification dismissal is
      // best-effort and the fee is already marked closed.
      console.error(
        `[deleteMembershipFee] Failed to dismiss notifications for fee ${feeId}:`,
        err,
      );
    }

    return { success: true };
  },
);
