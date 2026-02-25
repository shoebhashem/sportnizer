/**
 * uploadClubLogo - Cloud Function (onCall)
 *
 * Allows a club-admin to upload a logo for their club.
 *
 * Permission rules:
 * - Only club-admin can upload logo for their club
 *
 * The image is uploaded to profilePictures/clubs/{clubId}/logo.jpg via Admin SDK.
 * The resize extension then processes it to customProfilePictures/logo_200x200.png.
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { isClubAdmin } from "../utils/roleValidation";
import { validateRequiredFields } from "../utils/validation";

interface UploadClubLogoRequest {
  clubId: string;
  imageBase64: string;
  contentType: string;
}

interface UploadClubLogoResponse {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

export const uploadClubLogo = onCall(
  { region: config.region, maxInstances: 10 },
  async (request): Promise<UploadClubLogoResponse> => {
    try {
      // 1. Validate authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const callerId = request.auth.uid;

      // 2. Validate required fields
      const { clubId, imageBase64, contentType } =
        request.data as UploadClubLogoRequest;
      validateRequiredFields(request.data, [
        "clubId",
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

      // 5. Permission check - only club-admin can upload logo
      const hasClubAdminAccess = await isClubAdmin(callerId, clubId);

      if (!hasClubAdminAccess) {
        throw new HttpsError(
          "permission-denied",
          "Only club administrators can upload the club logo.",
        );
      }

      // 6. Verify club exists
      const db = admin.firestore();
      const clubDoc = await db.collection("clubs").doc(clubId).get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      // 7. Upload image to Storage via Admin SDK
      // Path: profilePictures/clubs/{clubId}/logo.jpg (to trigger resize extension)
      const bucket = admin.storage().bucket("sportnizer.firebasestorage.app");
      const filePath = `profilePictures/clubs/${clubId}/logo.jpg`;
      const file = bucket.file(filePath);

      const imageBuffer = Buffer.from(imageBase64, "base64");

      await file.save(imageBuffer, {
        metadata: {
          contentType,
        },
        public: true,
      });

      console.log(`✅ Uploaded club logo for club ${clubId} by ${callerId}`);

      // 8. Construct the predicted resized URL
      //    Uses GCS public URL format (works because MAKE_PUBLIC=true on resize extension)
      const bucketName = "sportnizer.firebasestorage.app";
      const cacheBuster = Date.now();
      const logoUrl = `https://storage.googleapis.com/${bucketName}/profilePictures/clubs/${clubId}/customProfilePictures/logo_200x200.png?t=${cacheBuster}`;

      return {
        success: true,
        logoUrl,
      };
    } catch (error: any) {
      console.error("Error uploading club logo:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        error.message || "Failed to upload club logo",
      );
    }
  },
);
