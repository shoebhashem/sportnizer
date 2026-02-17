import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { isClubAdmin } from "../utils/roleValidation";
import { validateRequiredFields } from "../utils/validation";

/**
 * Reactivates a soft-deleted group (undo deletion within grace period)
 * Also reactivates all subgroups that were cascade-deleted
 */
export const reactivateGroup = onCall(
  { region: config.region },
  async (request): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      // 2. Extract and validate parameters
      const { clubId, groupId } = request.data;
      validateRequiredFields(request.data, ["clubId", "groupId"]);

      // 3. Get group and verify permissions
      const db = admin.firestore();
      const groupRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId);

      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError("not-found", "Group not found");
      }

      const group = groupDoc.data();
      if (!group) {
        throw new HttpsError("not-found", "Group data not found");
      }

      // Check if user is a club-admin
      const hasPermission = await isClubAdmin(request.auth.uid, clubId);
      if (!hasPermission) {
        throw new HttpsError(
          "permission-denied",
          "Only club admins can reactivate groups",
        );
      }

      // Check if group is actually soft deleted
      if (group.isActive !== false) {
        throw new HttpsError("failed-precondition", "Group is not deleted");
      }

      // Check if still within grace period
      if (group.deletionScheduledAt) {
        const now = Date.now();
        const scheduledTime = group.deletionScheduledAt.toMillis();

        if (scheduledTime < now) {
          throw new HttpsError(
            "failed-precondition",
            "Grace period has expired. Group has been permanently deleted or scheduled for immediate deletion.",
          );
        }
      }

      // 4. Reactivate group
      await groupRef.update({
        isActive: true,
        deletionScheduledAt: admin.firestore.FieldValue.delete(),
        reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        reactivatedBy: request.auth.uid,
        lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: admin.firestore.FieldValue.increment(1),
      });

      // 5. Reactivate all subgroups (cascade)
      const subgroupsSnapshot = await groupRef
        .collection("subgroups")
        .where("isActive", "==", false)
        .get();

      if (!subgroupsSnapshot.empty) {
        const batch = db.batch();
        subgroupsSnapshot.docs.forEach((subgroupDoc) => {
          batch.update(subgroupDoc.ref, {
            isActive: true,
            deletionScheduledAt: admin.firestore.FieldValue.delete(),
            reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            deletionReason: admin.firestore.FieldValue.delete(),
          });
        });
        await batch.commit();
        console.log(
          `Reactivated ${subgroupsSnapshot.size} subgroups in cascade`,
        );
      }

      console.log(`Successfully reactivated group ${groupId}`);

      return {
        success: true,
      };
    } catch (error) {
      console.error("Error in reactivateGroup:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to reactivate group");
    }
  },
);
