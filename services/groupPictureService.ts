/**
 * Group Picture Service
 *
 * Handles uploading group pictures to Firebase Storage via Cloud Function.
 * The Cloud Function validates club-admin/group-admin permission and uploads via Admin SDK.
 *
 * Upload path: profilePictures/groups/{groupId}/logo.jpg
 * Resized output: profilePictures/groups/{groupId}/customProfilePictures/logo_200x200.png
 */

import { httpsCallable } from "firebase/functions";

import { functions } from "./core/firebase";

export interface GroupPictureUploadResult {
  success: boolean;
  pictureUrl?: string;
  error?: string;
}

/**
 * Upload a group picture (club-admin or group admin only).
 * Calls the uploadGroupPicture Cloud Function which:
 * 1. Validates the caller is a club-admin or group admin
 * 2. Uploads the image via Admin SDK
 * 3. The resize extension processes it to 200x200
 * 4. Stores the pictureUrl in the group Firestore doc
 */
export async function uploadGroupPicture(
  clubId: string,
  groupId: string,
  imageUri: string,
): Promise<GroupPictureUploadResult> {
  try {
    // 1. Fetch the image and convert to base64 (Cloud Functions can't receive blobs)
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // 2. Call the Cloud Function
    const uploadFn = httpsCallable<
      {
        clubId: string;
        groupId: string;
        imageBase64: string;
        contentType: string;
      },
      { success: boolean; pictureUrl?: string; error?: string }
    >(functions, "uploadGroupPicture");

    const result = await uploadFn({
      clubId,
      groupId,
      imageBase64: base64,
      contentType: "image/jpeg",
    });

    return {
      success: result.data.success,
      pictureUrl: result.data.pictureUrl,
      error: result.data.error,
    };
  } catch (error: any) {
    console.error("Error uploading group picture:", error);
    return {
      success: false,
      error: error.message || "Failed to upload group picture",
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
 * Get the predicted picture URL for a group.
 * Uses the same pattern as resized profile pictures.
 */
export function getGroupPictureUrl(
  groupId: string,
  cacheBuster?: number,
): string {
  const bucket = "sportnizer.firebasestorage.app";
  const timestamp = cacheBuster || Date.now();
  return `https://storage.googleapis.com/${bucket}/profilePictures/groups/${groupId}/customProfilePictures/logo_200x200.png?t=${timestamp}`;
}
