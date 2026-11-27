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
 * Only clubs and groups that still exist and are active count. A club or group
 * that was deleted (or is scheduled for deletion) can leave a stale entry on
 * the user's clubAccess; such entries never block account deletion.
 *
 * If any pre-condition fails, the function returns an error explaining what to do first.
 *
 * Actions on success:
 * 1. Delete Firebase Auth user
 * 2. Delete profile pictures from Storage (profilePictures/users/{uid}/)
 * 3. Delete Firestore /users/{uid} document with all its subcollections
 *    (notifications, pushTokens, ...)
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";

const STORAGE_BUCKET = "sportnizer.firebasestorage.app";

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

      // Look up which referenced clubs and groups still exist and are active
      const { liveClubIds, liveGroupKeys } = await findLiveClubsAndGroups(
        db,
        clubAccess,
      );

      for (const club of clubAccess) {
        if (club.isActive === false) continue;
        // Stale entry: the club was deleted or is scheduled for deletion
        if (!liveClubIds.has(club.clubId)) continue;

        // Check if user is a club-admin
        if (club.role === "club-admin") {
          activeClubAdminClubs.push(club.clubName || club.clubId);
        }

        // Check for active group memberships
        const groups = club.groupAccess || [];
        for (const group of groups) {
          if (group.isActive === false) continue;
          // Stale entry: the group was deleted or is scheduled for deletion
          if (!liveGroupKeys.has(`${club.clubId}/${group.groupId}`)) continue;
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

      // 7b. Delete the profile picture(s) from Storage (non-blocking)
      try {
        await admin
          .storage()
          .bucket(STORAGE_BUCKET)
          .deleteFiles({ prefix: `profilePictures/users/${callingUserId}/`, force: true });
        console.log(`  ✅ Deleted profile pictures from Storage`);
      } catch (storageError) {
        console.warn("  ⚠️ Profile picture cleanup failed:", storageError);
        // Non-blocking
      }

      // 7c. Delete the Firestore user document together with ALL its
      //     subcollections (notifications, pushTokens, ...)
      await db.recursiveDelete(userRef);
      console.log(`  ✅ Deleted user document and its subcollections`);

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

/**
 * Returns the IDs of the clubs referenced by active clubAccess entries that
 * still exist and are active, and the "clubId/groupId" keys of referenced
 * groups (in those clubs) that still exist and are active.
 */
async function findLiveClubsAndGroups(
  db: admin.firestore.Firestore,
  clubAccess: any[],
): Promise<{ liveClubIds: Set<string>; liveGroupKeys: Set<string> }> {
  const liveClubIds = new Set<string>();
  const liveGroupKeys = new Set<string>();

  const activeEntries = clubAccess.filter(
    (club: any) => club && club.clubId && club.isActive !== false,
  );
  const clubIds = [...new Set(activeEntries.map((c: any) => c.clubId as string))];
  if (clubIds.length === 0) return { liveClubIds, liveGroupKeys };

  const clubDocs = await db.getAll(
    ...clubIds.map((id) => db.collection("clubs").doc(id)),
  );
  for (const doc of clubDocs) {
    if (doc.exists && doc.data()?.isActive !== false) liveClubIds.add(doc.id);
  }

  const groupRefs: admin.firestore.DocumentReference[] = [];
  for (const club of activeEntries) {
    if (!liveClubIds.has(club.clubId)) continue;
    for (const group of club.groupAccess || []) {
      if (!group?.groupId || group.isActive === false) continue;
      groupRefs.push(
        db
          .collection("clubs")
          .doc(club.clubId)
          .collection("groups")
          .doc(group.groupId),
      );
    }
  }
  if (groupRefs.length > 0) {
    const groupDocs = await db.getAll(...groupRefs);
    for (const doc of groupDocs) {
      if (doc.exists && doc.data()?.isActive !== false) {
        liveGroupKeys.add(`${doc.ref.parent.parent!.id}/${doc.id}`);
      }
    }
  }

  return { liveClubIds, liveGroupKeys };
}
