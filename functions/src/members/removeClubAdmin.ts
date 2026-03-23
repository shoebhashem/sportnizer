/**
 * Remove Club Admin Function
 *
 * Removes the club-admin role from a user. Only callable by club-admins.
 * Guards against removing the sole club-admin (at least one must remain).
 *
 * Updates:
 * 1. Club allMembers/members — removes "club-admin" from roles[]
 * 2. User document — downgrades clubAccess[].role from "club-admin" to "member"
 *    (or marks inactive if the user has no other roles in the club)
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { flatArrayFieldsFromClubAccess } from "../utils/flatArrayHelpers";
import { validateRequiredFields } from "../utils/validation";

interface RemoveClubAdminRequest {
  clubId: string;
  userId: string; // The club-admin to remove
}

export const removeClubAdmin = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { clubId, userId }: RemoveClubAdminRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["clubId", "userId"]);

      // Verify the caller is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callingUserId = request.auth.uid;

      console.log(
        `User ${callingUserId} attempting to remove club-admin role from user ${userId} in club ${clubId}`,
      );

      const db = admin.firestore();

      // Step 1: Verify the caller is a club-admin
      const callingUserDoc = await db
        .collection("users")
        .doc(callingUserId)
        .get();

      if (!callingUserDoc.exists) {
        throw new HttpsError("not-found", "Calling user profile not found");
      }

      const callingUserData = callingUserDoc.data();
      const callerClubAccess = (callingUserData?.clubAccess || []).find(
        (c: any) => c.clubId === clubId,
      );

      if (!callerClubAccess || callerClubAccess.role !== "club-admin") {
        throw new HttpsError(
          "permission-denied",
          "Only club administrators can remove club-admin roles.",
        );
      }

      // Step 2: Get club members and count club-admins
      const clubMembersRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("allMembers")
        .doc("members");

      const clubMembersDoc = await clubMembersRef.get();
      if (!clubMembersDoc.exists) {
        throw new HttpsError("not-found", "Club members document not found");
      }

      const clubMembers = clubMembersDoc.data()?.members || [];
      const targetMemberIndex = clubMembers.findIndex(
        (m: any) => m.userId === userId,
      );

      if (targetMemberIndex === -1) {
        throw new HttpsError("not-found", "User is not a member of this club");
      }

      const targetMember = clubMembers[targetMemberIndex];
      const targetRoles: string[] = targetMember.roles || [];

      if (!targetRoles.includes("club-admin")) {
        return {
          success: false,
          error: "User does not have the club-admin role",
        };
      }

      // Step 3: Sole club-admin guard
      const clubAdminCount = clubMembers.filter(
        (m: any) =>
          m.isActive !== false && m.roles && m.roles.includes("club-admin"),
      ).length;

      if (clubAdminCount <= 1) {
        throw new HttpsError(
          "failed-precondition",
          "Cannot remove the last club admin. Assign another club admin first.",
        );
      }

      // Step 4: Remove ONE instance of "club-admin" from club member roles
      const roleIndex = targetRoles.indexOf("club-admin");
      const updatedRoles = [
        ...targetRoles.slice(0, roleIndex),
        ...targetRoles.slice(roleIndex + 1),
      ];
      clubMembers[targetMemberIndex].roles = updatedRoles;
      clubMembers[targetMemberIndex].lastModifiedAt = new Date();

      // If no roles left, mark inactive
      if (updatedRoles.length === 0) {
        clubMembers[targetMemberIndex].isActive = false;
        clubMembers[targetMemberIndex].inactiveSince = new Date();
        clubMembers[targetMemberIndex].scheduledForDeletion = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ); // 30 days
        console.log(
          `⚠️ Member ${userId} has no roles left - marked as inactive in club`,
        );
      }

      await clubMembersRef.update({
        members: clubMembers,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(
        `✅ Removed 'club-admin' from club member roles. Remaining: [${updatedRoles.join(", ")}]`,
      );

      // Step 5: Update user document — downgrade clubAccess[].role
      try {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          const userClubAccess = userData?.clubAccess || [];
          const clubIndex = userClubAccess.findIndex(
            (c: any) => c.clubId === clubId,
          );

          if (clubIndex >= 0) {
            // Check if user still has group-level roles (they remain a "member")
            const hasGroupRoles =
              (userClubAccess[clubIndex].groupAccess || []).length > 0;

            if (hasGroupRoles || updatedRoles.length > 0) {
              // Downgrade to "member" — still has other roles in the club
              userClubAccess[clubIndex].role = "member";
              console.log(
                `✅ Downgraded user ${userId} to 'member' in club ${clubId}`,
              );
            } else {
              // No roles and no group access — mark inactive
              userClubAccess[clubIndex].isActive = false;
              userClubAccess[clubIndex].inactiveSince = new Date();
              userClubAccess[clubIndex].scheduledForDeletion = new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              );
              console.log(
                `⚠️ User ${userId} has no access left in club — marked inactive`,
              );
            }

            await userRef.update({
              clubAccess: userClubAccess,
              ...flatArrayFieldsFromClubAccess(userClubAccess),
              lastModifiedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      } catch (userUpdateError) {
        console.warn(
          "⚠️ Failed to update user document after club-admin removal:",
          userUpdateError,
        );
        // Don't fail the entire operation
      }

      return {
        success: true,
        message: `Club admin role removed from user ${userId}`,
        updatedRoles,
      };
    } catch (error: any) {
      console.error("❌ Error in removeClubAdmin:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        `Failed to remove club admin: ${error.message}`,
      );
    }
  },
);
