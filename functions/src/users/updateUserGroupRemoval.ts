import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FunctionResponse } from "../types/interfaces";
import { config } from "../utils/config";
import { flatArrayFieldsFromClubAccess } from "../utils/flatArrayHelpers";
import { validateRequiredFields } from "../utils/validation";

/**
 * Update user document to remove group from groupAccess array
 *
 * Atomic function for updating user document when removed from a group.
 * Finds the club in clubAccess[] and removes the specific group from groupAccess[].
 *
 * @param userId - User ID to update
 * @param clubId - Club ID that contains the group
 * @param groupId - Group ID to remove from groupAccess
 * @returns Success result
 */

export interface UpdateUserGroupRemovalRequest {
  userId: string;
  clubId: string;
  groupId: string;
}

export const updateUserGroupRemoval = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { userId, clubId, groupId }: UpdateUserGroupRemovalRequest =
        request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["userId", "clubId", "groupId"]);

      console.log(
        `Removing group ${groupId} from user ${userId}'s groupAccess in club ${clubId}`,
      );

      const db = admin.firestore();
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      // Find the club and update its groupAccess
      const updatedClubAccess = clubAccess.map((ca: any) => {
        if (ca.clubId === clubId) {
          const groupAccess = ca.groupAccess || [];
          const updatedGroupAccess = groupAccess.filter(
            (ga: any) => ga.groupId !== groupId,
          );

          return {
            ...ca,
            groupAccess: updatedGroupAccess,
          };
        }
        return ca;
      });

      // Update user document
      await userRef.update({
        clubAccess: updatedClubAccess,
        ...flatArrayFieldsFromClubAccess(updatedClubAccess),
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      });

      console.log(
        `✅ Removed group ${groupId} from user ${userId}'s groupAccess`,
      );

      return {
        success: true,
        message: "User group access updated successfully",
      };
    } catch (error) {
      console.error("Error in updateUserGroupRemoval:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to update user group removal");
    }
  },
);
