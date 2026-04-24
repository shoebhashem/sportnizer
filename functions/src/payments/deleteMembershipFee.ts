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

    await feeRef.update({
      status: "closed",
      deletedAt: FieldValue.serverTimestamp(),
      lastModifiedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  },
);
