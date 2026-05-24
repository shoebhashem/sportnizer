import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createNotificationDirect } from "../notifications/createNotification";
import { config } from "../utils/config";

/**
 * Update the list of members who should receive a membership fee.
 *
 * Behaviour:
 *  - Members ADDED: receive a "pending" paymentStatus in allMembers and a
 *    new payment_request notification (with guardian handling for youth).
 *  - Members REMOVED (non-paid): paymentStatus cleared in allMembers and
 *    their payment_request notification is dismissed so the fee card
 *    disappears from their HomeScreen in near-real-time.
 *  - Members REMOVED who have already PAID: silently skipped (backend
 *    enforces this even if the frontend already blocked it). The count is
 *    returned so the UI can display a secondary warning.
 *
 * SECURITY: Only the club-admin of the fee's club may call this.
 * Fee must be active (cannot update a closed fee).
 */
export const updateFeeMembers = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{
    success: boolean;
    addedCount: number;
    removedCount: number;
    removedPaidCount: number;
  }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { feeId, memberIds } = request.data;

    if (!feeId || typeof feeId !== "string") {
      throw new HttpsError("invalid-argument", "feeId is required");
    }

    if (!Array.isArray(memberIds)) {
      throw new HttpsError(
        "invalid-argument",
        "memberIds must be an array of user ID strings",
      );
    }

    const db = admin.firestore();

    // 1. Load the fee document
    const feeRef = db.collection("membershipFees").doc(feeId);
    const feeDoc = await feeRef.get();

    if (!feeDoc.exists) {
      throw new HttpsError("not-found", "Fee not found");
    }

    const fee = feeDoc.data()!;

    if (fee.status === "closed") {
      throw new HttpsError(
        "failed-precondition",
        "Cannot update members of a closed fee",
      );
    }

    // 2. Verify caller is club-admin
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const clubAccess: any[] = userDoc.data()?.clubAccess || [];
    const access = clubAccess.find((a: any) => a.clubId === fee.clubId);

    if (!access || access.role !== "club-admin") {
      throw new HttpsError(
        "permission-denied",
        "Only club admins may update fee members",
      );
    }

    // 3. Load group members to validate the requested IDs
    const membersDocRef = db
      .collection("clubs")
      .doc(fee.clubId)
      .collection("groups")
      .doc(fee.groupId)
      .collection("allMembers")
      .doc("members");

    const membersDoc = await membersDocRef.get();

    if (!membersDoc.exists) {
      throw new HttpsError("not-found", "Group members document not found");
    }

    const allMembers: any[] = membersDoc.data()?.members || [];
    const validMemberIds = new Set(
      allMembers.map((m: { userId: string }) => m.userId),
    );

    // Only include IDs that are actual group members (security: never trust client IDs blindly)
    const sanitisedMemberIds = (memberIds as string[]).filter((id) =>
      validMemberIds.has(id),
    );

    // 4. Compute diff against current includedMembers
    const currentIncluded: string[] = fee.includedMembers || [];
    const currentSet = new Set(currentIncluded);
    const newSet = new Set(sanitisedMemberIds);

    const toAdd = sanitisedMemberIds.filter((id) => !currentSet.has(id));
    const toRemoveCandidate = currentIncluded.filter((id) => !newSet.has(id));

    // 5. Classify removals: skip paid members
    const toRemove: string[] = [];
    let removedPaidCount = 0;

    const memberMap = new Map<string, any>(
      allMembers.map((m: any) => [m.userId, m]),
    );

    for (const userId of toRemoveCandidate) {
      const member = memberMap.get(userId);
      const paymentStatus = member?.paymentStatus;
      if (
        paymentStatus?.activeFeeId === feeId &&
        paymentStatus?.status === "paid"
      ) {
        removedPaidCount++;
      } else {
        toRemove.push(userId);
      }
    }

    // 6. Build updated allMembers array
    const updatedMembers = allMembers.map((member: any) => {
      const uid: string = member.userId;

      if (toAdd.includes(uid)) {
        return {
          ...member,
          paymentStatus: {
            activeFeeId: feeId,
            status: "pending",
            amount: fee.amount,
            currency: fee.currency,
            dueDate: fee.dueDate || null,
            paidAt: null,
            paidBy: null,
          },
        };
      }

      if (toRemove.includes(uid)) {
        // Clear paymentStatus for removed (non-paid) members
        const { paymentStatus: _removed, ...rest } = member;
        void _removed;
        return rest;
      }

      return member;
    });

    // 7. Dismiss payment notifications for removed non-paid members
    const dismissPromises: Promise<void>[] = toRemove.map(async (userId) => {
      try {
        const notifQuery = await db
          .collection("users")
          .doc(userId)
          .collection("notifications")
          .where("type", "==", "payment_request")
          .where("dismissed", "==", false)
          .get();

        const batch = db.batch();
        let matched = 0;
        for (const doc of notifQuery.docs) {
          const meta = doc.data()?.metadata || {};
          if (meta.feeId === feeId) {
            batch.update(doc.ref, { dismissed: true });
            matched++;
          }
        }
        if (matched > 0) await batch.commit();
      } catch (err) {
        // Log but don't block the update — notification dismissal is best-effort
        console.error(
          `Failed to dismiss notifications for user ${userId}:`,
          err,
        );
      }
    });

    // 8. Create notifications + paymentStatus for added members
    const clubDoc = await db.collection("clubs").doc(fee.clubId).get();
    const clubData = clubDoc.data() || {};

    const notifyPromises: Promise<void>[] = toAdd.map(async (userId) => {
      const member = memberMap.get(userId);
      if (!member) return;

      try {
        const isYouthMember =
          member.needsGuardian &&
          member.guardiansContacts &&
          member.guardiansContacts.length > 0;

        if (isYouthMember) {
          for (const guardian of member.guardiansContacts) {
            if (guardian.guardianUid) {
              await createNotificationDirect(guardian.guardianUid, {
                type: "payment_request",
                title: fee.title,
                message: `Payment required for ${member.name}: ${fee.title}`,
                sourceId: feeId,
                sourceCollection: "membershipFees",
                clubId: fee.clubId,
                clubName: clubData.name || "Club",
                groupId: fee.groupId,
                groupName: fee.groupName,
                priority: "high",
                metadata: {
                  feeId,
                  beneficiaryId: userId,
                  beneficiaryName: member.name,
                  amount: fee.amount,
                  currency: fee.currency,
                  dueDate: fee.dueDate || null,
                },
              }).catch((err) =>
                console.error(
                  `Failed to notify guardian ${guardian.guardianUid}:`,
                  err,
                ),
              );
            }
          }
        } else {
          await createNotificationDirect(userId, {
            type: "payment_request",
            title: fee.title,
            message: `Payment required: ${fee.title}`,
            sourceId: feeId,
            sourceCollection: "membershipFees",
            clubId: fee.clubId,
            clubName: clubData.name || "Club",
            groupId: fee.groupId,
            groupName: fee.groupName,
            priority: "high",
            metadata: {
              feeId,
              beneficiaryId: userId,
              beneficiaryName: member.name,
              amount: fee.amount,
              currency: fee.currency,
              dueDate: fee.dueDate || null,
            },
          }).catch((err) =>
            console.error(`Failed to notify member ${userId}:`, err),
          );
        }
      } catch (err) {
        console.error(
          `Failed to create notification for added member ${userId}:`,
          err,
        );
      }
    });

    // 9. Compute final includedMembers list
    // Start from current, remove the non-paid removals, then add new members
    const finalIncluded = [
      ...currentIncluded.filter((id) => !toRemove.includes(id)),
      ...toAdd,
    ];

    // 10. Persist all changes concurrently
    await Promise.all([
      // Update allMembers array
      membersDocRef.update({ members: updatedMembers }),
      // Update fee document
      feeRef.update({
        includedMembers: finalIncluded,
        totalExpected: finalIncluded.length,
        lastModifiedAt: FieldValue.serverTimestamp(),
      }),
      // Dismiss notifications (best-effort)
      Promise.all(dismissPromises),
      // Send new notifications (best-effort)
      Promise.all(notifyPromises),
    ]);

    return {
      success: true,
      addedCount: toAdd.length,
      removedCount: toRemove.length,
      removedPaidCount,
    };
  },
);
