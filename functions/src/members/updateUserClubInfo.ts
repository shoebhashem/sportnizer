import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    FunctionResponse,
    UpdateUserClubInfoRequest,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

export const updateUserClubInfo = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { uid, clubInfo, role }: UpdateUserClubInfoRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ["uid", "clubInfo", "role"]);
      validateRequiredFields(clubInfo, [
        "clubId",
        "clubName",
        "role",
        "joinedAt",
      ]);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      console.log(
        `Updating club info for user ${uid}, club ${clubInfo.clubId}`,
      );

      // Get user document
      const userRef = admin.firestore().collection("users").doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User document not found");
      }

      const userData = userDoc.data();
      let clubAccess = userData?.clubAccess || []; // Support backward compatibility

      // 🆕 REACTIVATION LOGIC: Check if club membership already exists (including inactive)
      const existingClubIndex = clubAccess.findIndex(
        (club: any) => club.clubId === clubInfo.clubId,
      );

      if (existingClubIndex !== -1) {
        const existingClub = clubAccess[existingClubIndex];

        // Check if club is inactive and reactivate if within grace period
        if (existingClub.isActive === false) {
          const now = new Date();
          const scheduledDeletion = existingClub.scheduledForDeletion
            ? existingClub.scheduledForDeletion.toDate
              ? existingClub.scheduledForDeletion.toDate()
              : new Date(existingClub.scheduledForDeletion)
            : null;

          if (scheduledDeletion && now < scheduledDeletion) {
            console.log(
              `♻️ Reactivating club membership for user ${uid} in club ${clubInfo.clubId} - within grace period`,
            );

            clubAccess[existingClubIndex] = {
              ...existingClub,
              role: role === "club-admin" ? "club-admin" : "member",
              isActive: true,
              inactiveSince: null,
              scheduledForDeletion: null,
              reactivatedAt: now,
              reactivationCount: (existingClub.reactivationCount || 0) + 1,
              lastModifiedAt: now,
            };
          } else {
            console.log(
              `♻️ Reactivating club membership for user ${uid} in club ${clubInfo.clubId} - grace period expired`,
            );

            clubAccess[existingClubIndex] = {
              clubId: clubInfo.clubId,
              clubName: clubInfo.clubName,
              role: role === "club-admin" ? "club-admin" : "member",
              isActive: true,
              inactiveSince: null,
              scheduledForDeletion: null,
              groupAccess: existingClub.groupAccess || [],
              joinedAt: clubInfo.joinedAt,
              reactivatedAt: now,
              reactivationCount: (existingClub.reactivationCount || 0) + 1,
              lastModifiedAt: now,
            };
          }
        } else {
          // Club is already active - check if we need to promote to club-admin
          const currentRole = existingClub.role || "member";
          const normalizedRequestedRole =
            role === "club-admin" ? "club-admin" : "member";

          if (
            normalizedRequestedRole === "club-admin" &&
            currentRole !== "club-admin"
          ) {
            // Promoting existing member to club-admin
            console.log(
              `⬆️ Promoting user ${uid} to club-admin in club ${clubInfo.clubId}`,
            );
            const now = new Date();
            clubAccess[existingClubIndex] = {
              ...existingClub,
              role: "club-admin",
              lastModifiedAt: now,
            };
          } else {
            // No role change needed - return success (no-op)
            console.log(
              `ℹ️ User ${uid} already has role '${currentRole}' - no update needed`,
            );
            return {
              success: true,
              message: "User is already a member of this club",
            };
          }
        }
      } else {
        // Add new club membership with new structure
        // Note: role field is permission-based: only 'club-admin' or 'member'
        // Actual operational roles (player, coach, guardian, etc.) are stored in member lists
        clubAccess.push({
          clubId: clubInfo.clubId,
          clubName: clubInfo.clubName,
          role: role === "club-admin" ? "club-admin" : "member",
          isActive: true,
          groupAccess: [], // Initialize empty groupAccess for the new club
          joinedAt: clubInfo.joinedAt,
          lastModifiedAt: clubInfo.lastModifiedAt,
        });
      }

      // Update user document with new structure and increment version
      const updateData: any = {
        clubAccess: clubAccess,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp(),
      };

      // 🆕 GLOBAL REACTIVATION: Check if user is globally inactive and reactivate
      if (userData?.isActive === false) {
        const userScheduledDeletion = userData.scheduledForDeletion
          ? userData.scheduledForDeletion.toDate
            ? userData.scheduledForDeletion.toDate()
            : new Date(userData.scheduledForDeletion)
          : null;

        const now = new Date();
        // Reactivate if within grace period or if no scheduled deletion
        if (!userScheduledDeletion || now < userScheduledDeletion) {
          console.log(
            `♻️ Reactivating user ${uid} at GLOBAL level - was inactive but joining club`,
          );
          updateData.isActive = true;
          updateData.inactiveSince = FieldValue.delete();
          updateData.scheduledForDeletion = FieldValue.delete();
        } else {
          console.log(
            `⚠️ User ${uid} grace period expired, but allowing reactivation on rejoin`,
          );
          updateData.isActive = true;
          updateData.inactiveSince = FieldValue.delete();
          updateData.scheduledForDeletion = FieldValue.delete();
        }
      }

      await userRef.update(updateData);

      console.log(`Successfully updated club info for user ${uid}`);

      return {
        success: true,
        message: `User club info updated successfully`,
      };
    } catch (error) {
      console.error("Error in updateUserClubInfo:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to update user club info");
    }
  },
);
