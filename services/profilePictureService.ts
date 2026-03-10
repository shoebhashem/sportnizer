/**
 * Profile Picture Service
 *
 * Handles uploading profile pictures via Cloud Functions.
 * - Self-upload: Calls uploadOwnProfilePicture Cloud Function
 * - Admin/coach upload for member: Calls uploadProfilePictureForMember Cloud Function
 *
 * Upload path: profilePictures/users/{userId}/profile.jpg
 * Resized output: profilePictures/users/{userId}/customProfilePictures/profile_200x200.png (by resize extension)
 */

import { httpsCallable } from "firebase/functions";

import { compressImage } from "@/utils/imageCompression";

import { functions } from "./core/firebase";
import type { ProfilePictureUploadResult } from "./types/user";

/**
 * Upload the current user's own profile picture.
 * Calls the uploadOwnProfilePicture Cloud Function which:
 * 1. Uploads the image via Admin SDK (reliable, no retry-limit-exceeded)
 * 2. Waits for the resize extension to process the image
 * 3. Returns the confirmed resized URL
 */
export async function uploadOwnProfilePicture(
  userId: string,
  imageUri: string,
): Promise<ProfilePictureUploadResult> {
  try {
    // 1. Compress the image before upload
    const compressedUri = await compressImage(imageUri);

    // 2. Fetch the compressed image and convert to base64
    const response = await fetch(compressedUri);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // 3. Call the Cloud Function
    const uploadFn = httpsCallable<
      {
        imageBase64: string;
        contentType: string;
      },
      { success: boolean; photoURL?: string; error?: string }
    >(functions, "uploadOwnProfilePicture");

    const result = await uploadFn({
      imageBase64: base64,
      contentType: "image/jpeg",
    });

    return {
      success: result.data.success,
      photoURL: result.data.photoURL,
      error: result.data.error,
    };
  } catch (error: any) {
    console.error("Error uploading profile picture:", error);
    return {
      success: false,
      error: error.message || "Failed to upload profile picture",
    };
  }
}

/**
 * Upload a profile picture for another member (admin/coach action).
 * Calls the uploadProfilePictureForMember Cloud Function which:
 * 1. Validates the caller has permission (club-admin, or admin/coach in the group)
 * 2. Uploads the image via Admin SDK
 * 3. The resize extension + onProfilePictureResized then updates Firestore
 */
export async function uploadProfilePictureForMember(
  targetUserId: string,
  clubId: string,
  groupId: string,
  imageUri: string,
): Promise<ProfilePictureUploadResult> {
  try {
    // 1. Compress the image before upload
    const compressedUri = await compressImage(imageUri);

    // 2. Fetch the compressed image and convert to base64
    const response = await fetch(compressedUri);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // 3. Call the Cloud Function
    const uploadFn = httpsCallable<
      {
        targetUserId: string;
        clubId: string;
        groupId: string;
        imageBase64: string;
        contentType: string;
      },
      { success: boolean; photoURL?: string; error?: string }
    >(functions, "uploadProfilePictureForMember");

    const result = await uploadFn({
      targetUserId,
      clubId,
      groupId,
      imageBase64: base64,
      contentType: "image/jpeg",
    });

    return {
      success: result.data.success,
      photoURL: result.data.photoURL,
      error: result.data.error,
    };
  } catch (error: any) {
    console.error("Error uploading profile picture for member:", error);
    return {
      success: false,
      error: error.message || "Failed to upload profile picture for member",
    };
  }
}

/**
 * Convert a Blob to a base64 string (without the data URI prefix)
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:image/jpeg;base64," prefix
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
