/**
 * uploadOwnProfilePicture - Cloud Function (onCall)
 *
 * Allows a user to upload their own profile picture via Cloud Function
 * instead of direct client-side Storage upload. This avoids the
 * "retry-limit-exceeded" error that occurs with uploadBytes on unstable
 * connections.
 *
 * The image is uploaded to profilePictures/users/{userId}/profile.jpg via Admin SDK.
 * The resize extension then processes it to customProfilePictures/profile_200x200.png.
 * The onProfilePictureResized trigger updates Firestore everywhere.
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";
import { waitForResizedImage } from "../utils/waitForResizedImage";

interface UploadOwnProfilePictureRequest {
  imageBase64: string;
  contentType: string;
}

interface UploadOwnProfilePictureResponse {
  success: boolean;
  photoURL?: string;
  error?: string;
}

export const uploadOwnProfilePicture = onCall(
  { region: config.region, maxInstances: 10 },
  async (request): Promise<UploadOwnProfilePictureResponse> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;

      // 2. Validate required fields
      const { imageBase64, contentType } =
        request.data as UploadOwnProfilePictureRequest;
      validateRequiredFields(request.data, ["imageBase64", "contentType"]);

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

      // 5. Upload image to Storage via Admin SDK
      // Path: profilePictures/users/{userId}/profile.jpg (to trigger resize extension)
      const bucket = admin.storage().bucket("sportnizer.firebasestorage.app");
      const filePath = `profilePictures/users/${userId}/profile.jpg`;
      const file = bucket.file(filePath);

      const imageBuffer = Buffer.from(imageBase64, "base64");

      await file.save(imageBuffer, {
        metadata: {
          contentType,
          cacheControl: "no-cache, max-age=0",
        },
        public: true,
      });

      console.log(`✅ Uploaded own profile picture for ${userId}`);

      // 6. Wait for the resized image to be created by the resize extension
      const bucketName = "sportnizer.firebasestorage.app";
      const resizedPath = `profilePictures/users/${userId}/customProfilePictures/profile_200x200.png`;
      const photoURL = await waitForResizedImage(bucketName, resizedPath);

      return {
        success: true,
        photoURL,
      };
    } catch (error: any) {
      console.error("Error uploading own profile picture:", error);

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
