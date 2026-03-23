/**
 * Delete User Account Function
 *
 * Immediately and permanently deletes a user's account.
 * Self-only: the caller must be deleting their OWN account.
 *
 * Pre-conditions (all must be true):
 * - User has NO active group memberships (clubAccess[].groupAccess must be empty)
 * - User has NO active dependents (no youth players linked as guardian)
 * - User does NOT hold the club-admin role in any club
 *
 * If any pre-condition fails, the function returns an error explaining what to do first.
 *
 * Actions on success:
 * 1. Delete Firebase Auth user
 * 2. Delete Firestore /users/{uid} document
 * 3. Clean up any remaining notification documents
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

export const deleteUserAccount = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      // 1. Verify caller is authenticated
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated to delete your account",
        );
      }

      const callingUserId = request.auth.uid;

      console.log(`🗑️ User ${callingUserId} requesting account deletion`);

      const db = admin.firestore();

      // 2. Get the user document
      const userRef = db.collection("users").doc(callingUserId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data()!;
      const clubAccess = userData.clubAccess || [];
      const dependents = userData.dependents || [];

      // 3. Check for active group memberships
      const activeGroups: { clubName: string; groupName: string }[] = [];
      const activeClubAdminClubs: string[] = [];

      for (const club of clubAccess) {
        if (club.isActive === false) continue;

        // Check if user is a club-admin
        if (club.role === "club-admin") {
          activeClubAdminClubs.push(club.clubName || club.clubId);
        }

        // Check for active group memberships
        const groups = club.groupAccess || [];
        for (const group of groups) {
          if (group.isActive === false) continue;
          if (group.roles && group.roles.length > 0) {
            activeGroups.push({
              clubName: club.clubName || club.clubId,
              groupName: group.groupName || group.groupId,
            });
          }
        }
      }

      // 4. Block if user has active group memberships
      if (activeGroups.length > 0) {
        const groupList = activeGroups
          .map((g) => `${g.groupName} (${g.clubName})`)
          .join(", ");
        return {
          success: false,
          reason: "has_groups",
          message: `You must leave all groups before deleting your account. Active groups: ${groupList}`,
          activeGroups,
        };
      }

      // 5. Block if user is a club-admin
      if (activeClubAdminClubs.length > 0) {
        return {
          success: false,
          reason: "is_club_admin",
          message: `You must be removed as club admin before deleting your account. Clubs: ${activeClubAdminClubs.join(", ")}`,
          activeClubAdminClubs,
        };
      }

      // 6. Block if user has active dependents (is a guardian with linked youth)
      const activeDependents = dependents.filter((dep: any) => {
        const depClubAccess = dep.clubAccess || [];
        return depClubAccess.some((ca: any) => ca.isActive !== false);
      });

      if (activeDependents.length > 0) {
        const depNames = activeDependents
          .map((d: any) => d.name || d.uid)
          .join(", ");
        return {
          success: false,
          reason: "has_dependents",
          message: `You are a guardian for active youth players. Contact a club admin to remove the youth players first. Youth: ${depNames}`,
          activeDependents: depNames,
        };
      }

      // 7. All checks passed — perform hard delete
      console.log(
        `✅ All pre-conditions met. Performing hard delete for user ${callingUserId}`,
      );

      // 7a. Delete from Firebase Auth
      try {
        await admin.auth().deleteUser(callingUserId);
        console.log(`  ✅ Deleted from Firebase Auth`);
      } catch (authError: any) {
        if (authError.code !== "auth/user-not-found") {
          console.error(`  ❌ Failed to delete from Auth:`, authError);
          throw new HttpsError(
            "internal",
            "Failed to delete authentication account",
          );
        }
      }

      // 7b. Clean up notifications
      try {
        const notificationsSnapshot = await db
          .collection("users")
          .doc(callingUserId)
          .collection("notifications")
          .get();

        if (!notificationsSnapshot.empty) {
          const batch = db.batch();
          notificationsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
          console.log(
            `  ✅ Deleted ${notificationsSnapshot.size} notifications`,
          );
        }
      } catch (notifError) {
        console.warn("  ⚠️ Notification cleanup failed:", notifError);
        // Non-blocking
      }

      // 7c. Delete Firestore user document
      await userRef.delete();
      console.log(`  ✅ Deleted user document`);

      console.log(`🗑️ Account deletion complete for user ${callingUserId}`);

      return {
        success: true,
        message: "Your account has been permanently deleted.",
      };
    } catch (error: any) {
      console.error("❌ Error in deleteUserAccount:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        `Failed to delete account: ${error.message}`,
      );
    }
  },
);
