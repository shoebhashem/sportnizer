import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Update editable fields on a membership fee.
 *
 * Only title, description, and dueDate may be changed after creation.
 * Amount, currency, targetRoles and category are immutable once created
 * because members may already have received payment requests.
 *
 * SECURITY: Only the club-admin of the fee's club may update it.
 */
export const updateMembershipFee = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { feeId, title, description, dueDate } = request.data;

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

    if (fee.status === "closed") {
      throw new HttpsError("failed-precondition", "Cannot update a closed fee");
    }

    // Verify caller is club-admin
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a) => a.clubId === fee.clubId);

    if (!access || access.role !== "club-admin") {
      throw new HttpsError(
        "permission-denied",
        "Only club admins may update fees",
      );
    }

    // Build update payload — only allow whitelisted fields
    const update: Record<string, any> = {
      lastModifiedAt: FieldValue.serverTimestamp(),
    };

    if (title !== undefined) {
      const trimmed = String(title).trim();
      if (!trimmed) {
        throw new HttpsError("invalid-argument", "Title cannot be empty");
      }
      update.title = trimmed;
    }

    if (description !== undefined) {
      update.description = description ? String(description).trim() : null;
    }

    if (dueDate !== undefined) {
      update.dueDate = dueDate
        ? admin.firestore.Timestamp.fromDate(new Date(dueDate))
        : null;
    }

    await feeRef.update(update);

    return { success: true };
  },
);
