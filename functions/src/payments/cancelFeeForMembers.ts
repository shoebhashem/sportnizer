import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

/**
 * Cancel a membership fee obligation for specific members.
 *
 * Sets paymentStatus.status = "cancelled" for the targeted members in the
 * group's allMembers document, keeping them visible in the admin's
 * track-payments view with a "Cancelled" badge (audit trail).
 *
 * Dismisses their payment_request notifications (including guardian
 * notifications for youth members) so the fee card disappears from the
 * home screen and news tab immediately.
 *
 * Rules:
 * - Caller must be club-admin of the fee's club
 * - Fee must be active (cannot cancel on a closed fee)
 * - Paid members are silently skipped (their money has been received)
 * - Already-cancelled members are silently skipped (idempotent)
 *
 * Returns: { success, cancelledCount, skippedPaidCount }
 */
export const cancelFeeForMembers = onCall(
  { region: config.region },
  async (request): Promise<{
    success: boolean;
    cancelledCount: number;
    skippedPaidCount: number;
  }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { feeId, memberIds } = request.data;

    if (!feeId || typeof feeId !== "string") {
      throw new HttpsError("invalid-argument", "feeId is required");
    }
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "memberIds must be a non-empty array",
      );
    }

    const db = admin.firestore();

    // --- Load and validate the fee ---
    const feeRef = db.collection("membershipFees").doc(feeId);
    const feeDoc = await feeRef.get();

    if (!feeDoc.exists) {
      throw new HttpsError("not-found", "Fee not found");
    }

    const fee = feeDoc.data()!;

    // Verify caller is club-admin
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a: any) => a.clubId === fee.clubId);

    if (!access || access.role !== "club-admin") {
      throw new HttpsError(
        "permission-denied",
        "Only club admins may cancel fee obligations",
      );
    }

    // Only allow cancellation on active fees
    if (fee.status !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "Fee must be active to cancel member obligations",
      );
    }

    // --- Load allMembers document ---
    const allMembersRef = db
      .collection("clubs")
      .doc(fee.clubId)
      .collection("groups")
      .doc(fee.groupId)
      .collection("allMembers")
      .doc("members");

    const allMembersSnap = await allMembersRef.get();
    const members: any[] = allMembersSnap.data()?.members ?? [];

    // --- Process cancellations ---
    let cancelledCount = 0;
    let skippedPaidCount = 0;
    const actuallyCancelled: string[] = [];

    const updatedMembers = members.map((member) => {
      if (!memberIds.includes(member.userId)) return member;

      const ps = member.paymentStatus;

      // Member is not part of this fee — skip
      if (!ps || ps.activeFeeId !== feeId) return member;

      // Already paid — skip silently, count it
      if (ps.status === "paid") {
        skippedPaidCount++;
        return member;
      }

      // Already cancelled — idempotent, skip silently
      if (ps.status === "cancelled") return member;

      // Cancel the obligation
      cancelledCount++;
      actuallyCancelled.push(member.userId);
      return {
        ...member,
        paymentStatus: {
          ...ps,
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
        },
      };
    });

    // Nothing to do
    if (cancelledCount === 0) {
      return { success: true, cancelledCount: 0, skippedPaidCount };
    }

    // --- Write allMembers and decrement totalExpected ---
    await allMembersRef.update({ members: updatedMembers });

    await feeRef.update({
      totalExpected: FieldValue.increment(-cancelledCount),
      lastModifiedAt: FieldValue.serverTimestamp(),
    });

    // --- Dismiss notifications (best-effort, handles guardians) ---
    // Query by metadata.beneficiaryId so we catch both direct member
    // notifications AND guardian notifications for youth members.
    try {
      const BATCH_SIZE = 500;
      let pendingBatch = db.batch();
      let pendingBatchSize = 0;

      for (const userId of actuallyCancelled) {
        const notifSnap = await db
          .collectionGroup("notifications")
          .where("metadata.feeId", "==", feeId)
          .where("metadata.beneficiaryId", "==", userId)
          .where("dismissed", "==", false)
          .get();

        for (const doc of notifSnap.docs) {
          pendingBatch.update(doc.ref, {
            dismissed: true,
            read: true,
            dismissedAt: FieldValue.serverTimestamp(),
          });
          pendingBatchSize++;

          if (pendingBatchSize === BATCH_SIZE) {
            await pendingBatch.commit();
            pendingBatch = db.batch();
            pendingBatchSize = 0;
          }
        }
      }

      if (pendingBatchSize > 0) {
        await pendingBatch.commit();
      }
    } catch (err) {
      // Log but do not fail the cancellation — dismissal is best-effort
      console.error(
        `[cancelFeeForMembers] Failed to dismiss notifications for fee ${feeId}:`,
        err,
      );
    }

    return { success: true, cancelledCount, skippedPaidCount };
  },
);
