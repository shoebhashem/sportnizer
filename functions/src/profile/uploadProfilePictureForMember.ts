/**
 * uploadProfilePictureForMember - Cloud Function (onCall)
 *
 * Allows a club-admin, group admin, or group coach to upload a profile picture
 * on behalf of another member.
 *
 * Permission rules:
 * - club-admin: Can upload for any member in their club
 * - admin/coach: Can upload for members in groups they manage
 *
 * The image is uploaded to profilePictures/users/{targetUserId}/profile.jpg via Admin SDK.
 * The resize extension then processes it, and onProfilePictureResized updates Firestore.
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { isClubAdmin } from "../utils/roleValidation";
import { validateRequiredFields } from "../utils/validation";
import { waitForResizedImage } from "../utils/waitForResizedImage";

interface UploadForMemberRequest {
  targetUserId: string;
  clubId: string;
  groupId: string;
  imageBase64: string;
  contentType: string;
}

interface UploadForMemberResponse {
  success: boolean;
  photoURL?: string;
  error?: string;
}

export const uploadProfilePictureForMember = onCall(
  { region: config.region, maxInstances: 10 },
  async (request): Promise<UploadForMemberResponse> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callerId = request.auth.uid;

      // 2. Validate required fields
      const { targetUserId, clubId, groupId, imageBase64, contentType } =
        request.data as UploadForMemberRequest;
      validateRequiredFields(request.data, [
        "targetUserId",
        "clubId",
        "groupId",
        "imageBase64",
        "contentType",
      ]);

      // 3. Validate content type
      if (!contentType.startsWith("image/")) {
        throw new HttpsError(
          "invalid-argument",
          "Only image files are allowed",
        );
      }

      // 4. Validate image size (base64 is ~33% larger than binary, so 5MB binary ≈ 6.7MB base64)
      const maxBase64Size = 7 * 1024 * 1024; // ~5MB binary
      if (imageBase64.length > maxBase64Size) {
        throw new HttpsError(
          "invalid-argument",
          "Image file is too large. Maximum size is 5MB.",
        );
      }

      // 5. Permission check
      const hasClubAdminAccess = await isClubAdmin(callerId, clubId);

      if (!hasClubAdminAccess) {
        // Check if caller is admin or coach in the specified group
        const hasGroupManageAccess = await checkGroupManageRole(
          callerId,
          clubId,
          groupId,
        );

        if (!hasGroupManageAccess) {
          // Check if caller is the guardian of the target user
          const isGuardian = await checkIsGuardianOf(callerId, targetUserId);

          if (!isGuardian) {
            throw new HttpsError(
              "permission-denied",
              "You do not have permission to upload a profile picture for this member. " +
                "You must be a club admin, an admin/coach in the member's group, or the member's guardian.",
            );
          }

          console.log(
            `✅ Guardian ${callerId} uploading profile picture for dependent ${targetUserId}`,
          );
        } else {
          // Verify the target user is actually in this group (for admin/coach path only)
          const isTargetInGroup = await checkMemberInGroup(
            targetUserId,
            clubId,
            groupId,
          );

          if (!isTargetInGroup) {
            throw new HttpsError(
              "permission-denied",
              "The target member is not in a group you manage.",
            );
          }
        }
      }

      // 6. Upload image to Storage via Admin SDK
      const bucket = admin.storage().bucket("sportnizer.firebasestorage.app");
      const filePath = `profilePictures/users/${targetUserId}/profile.jpg`;
      const file = bucket.file(filePath);

      const imageBuffer = Buffer.from(imageBase64, "base64");

      await file.save(imageBuffer, {
        metadata: {
          contentType,
          cacheControl: "no-cache, max-age=0",
        },
        public: true,
      });

      console.log(
        `✅ Uploaded profile picture for ${targetUserId} by ${callerId}`,
      );

      // 7. Wait for the resized image to be created by the resize extension
      const bucketName = "sportnizer.firebasestorage.app";
      const resizedPath = `profilePictures/users/${targetUserId}/customProfilePictures/profile_200x200.png`;
      const photoURL = await waitForResizedImage(bucketName, resizedPath);

      return {
        success: true,
        photoURL,
      };
    } catch (error: any) {
      console.error("Error uploading profile picture for member:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        error.message || "Failed to upload profile picture",
      );
    }
  },
);

/**
 * Check if a user has admin or coach role in a specific group.
 */
async function checkGroupManageRole(
  userId: string,
  clubId: string,
  groupId: string,
): Promise<boolean> {
  const db = admin.firestore();
  const membersDoc = await db
    .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
    .get();

  if (!membersDoc.exists) return false;

  const members = membersDoc.data()?.members || [];
  const member = members.find((m: any) => m.userId === userId);

  if (!member) return false;

  const roles: string[] = member.roles || [];
  return roles.includes("admin") || roles.includes("coach");
}

/**
 * Check if a target user is a member of a specific group.
 */
async function checkMemberInGroup(
  targetUserId: string,
  clubId: string,
  groupId: string,
): Promise<boolean> {
  const db = admin.firestore();
  const membersDoc = await db
    .doc(`clubs/${clubId}/groups/${groupId}/allMembers/members`)
    .get();

  if (!membersDoc.exists) return false;

  const members = membersDoc.data()?.members || [];
  return members.some(
    (m: any) => m.userId === targetUserId && m.isActive !== false,
  );
}

/**
 * Check if caller is the guardian of a target user.
 * Looks at the caller's dependents[] array on their user doc.
 */
async function checkIsGuardianOf(
  callerId: string,
  targetUserId: string,
): Promise<boolean> {
  const db = admin.firestore();
  const callerDoc = await db.collection("users").doc(callerId).get();
  if (!callerDoc.exists) return false;

  const dependents: any[] = callerDoc.data()?.dependents || [];
  return dependents.some((dep: any) => dep.uid === targetUserId);
}
