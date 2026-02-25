/**
 * Club Logo Service
 *
 * Handles uploading club logos to Firebase Storage via Cloud Function.
 * The Cloud Function validates club-admin permission and uploads via Admin SDK.
 *
 * Upload path: profilePictures/clubs/{clubId}/logo.jpg
 * Resized output: profilePictures/clubs/{clubId}/customProfilePictures/logo_200x200.png
 */

import { httpsCallable } from "firebase/functions";

import { functions } from "./core/firebase";

export interface ClubLogoUploadResult {
  success: boolean;
  logoUrl?: string;
  error?: string;
}

/**
 * Upload a club logo (club-admin only).
 * Calls the uploadClubLogo Cloud Function which:
 * 1. Validates the caller is a club-admin
 * 2. Uploads the image via Admin SDK
 * 3. The resize extension processes it to 200x200
 */
export async function uploadClubLogo(
  clubId: string,
  imageUri: string,
): Promise<ClubLogoUploadResult> {
  try {
    // 1. Fetch the image and convert to base64 (Cloud Functions can't receive blobs)
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // 2. Call the Cloud Function
    const uploadFn = httpsCallable<
      {
        clubId: string;
        imageBase64: string;
        contentType: string;
      },
      { success: boolean; logoUrl?: string; error?: string }
    >(functions, "uploadClubLogo");

    const result = await uploadFn({
      clubId,
      imageBase64: base64,
      contentType: "image/jpeg",
    });

    return {
      success: result.data.success,
      logoUrl: result.data.logoUrl,
      error: result.data.error,
    };
  } catch (error: any) {
    console.error("Error uploading club logo:", error);
    return {
      success: false,
      error: error.message || "Failed to upload club logo",
    };
  }
}

/**
 * Convert blob to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get the predicted logo URL for a club.
 * Uses the same pattern as resized profile pictures.
 */
export function getClubLogoUrl(clubId: string, cacheBuster?: number): string {
  const bucket = "sportnizer.firebasestorage.app";
  const timestamp = cacheBuster || Date.now();
  return `https://storage.googleapis.com/${bucket}/profilePictures/clubs/${clubId}/customProfilePictures/logo_200x200.png?t=${timestamp}`;
}
