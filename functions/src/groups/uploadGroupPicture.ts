/**
 * uploadGroupPicture - Cloud Function (onCall)
 *
 * Allows a club-admin or group admin to upload a picture for their group.
 *
 * Permission rules:
 * - Only club-admin or group admin can upload picture
 *
 * The image is uploaded to profilePictures/groups/{groupId}/logo.jpg via Admin SDK.
 * The resize extension then processes it to customProfilePictures/logo_200x200.png.
 * The resized URL is stored in the group Firestore doc as pictureUrl.
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { isGroupAdmin } from "../utils/roleValidation";
import { validateRequiredFields } from "../utils/validation";

interface UploadGroupPictureRequest {
  clubId: string;
  groupId: string;
  imageBase64: string;
  contentType: string;
}

interface UploadGroupPictureResponse {
  success: boolean;
  pictureUrl?: string;
  error?: string;
}

export const uploadGroupPicture = onCall(
  { region: config.region, maxInstances: 10 },
  async (request): Promise<UploadGroupPictureResponse> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callerId = request.auth.uid;

      // 2. Validate required fields
      const { clubId, groupId, imageBase64, contentType } =
        request.data as UploadGroupPictureRequest;
      validateRequiredFields(request.data, [
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

      // 5. Permission check - club-admin or group admin
      const hasPermission = await isGroupAdmin(callerId, clubId, groupId);

      if (!hasPermission) {
        throw new HttpsError(
          "permission-denied",
          "Only club admins or group admins can upload the group picture.",
        );
      }

      // 6. Verify group exists
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

      // 7. Upload image to Storage via Admin SDK
      // Path: profilePictures/groups/{groupId}/logo.jpg (to trigger resize extension)
      const bucket = admin.storage().bucket("sportnizer.firebasestorage.app");
      const filePath = `profilePictures/groups/${groupId}/logo.jpg`;
      const file = bucket.file(filePath);

      const imageBuffer = Buffer.from(imageBase64, "base64");

      await file.save(imageBuffer, {
        metadata: {
          contentType,
        },
        public: true,
      });

      console.log(
        `✅ Uploaded group picture for group ${groupId} (club ${clubId}) by ${callerId}`,
      );

      // 8. Construct the predicted resized URL
      const bucketName = "sportnizer.firebasestorage.app";
      const cacheBuster = Date.now();
      const pictureUrl = `https://storage.googleapis.com/${bucketName}/profilePictures/groups/${groupId}/customProfilePictures/logo_200x200.png?t=${cacheBuster}`;

      // 9. Store the pictureUrl in the group document
      await groupRef.update({
        pictureUrl,
        lastModifiedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1),
      });

      return {
        success: true,
        pictureUrl,
      };
    } catch (error: any) {
      console.error("Error uploading group picture:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        error.message || "Failed to upload group picture",
      );
    }
  },
);
