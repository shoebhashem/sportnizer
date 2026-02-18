/**
 * Profile Picture Service
 *
 * Handles uploading profile pictures to Firebase Storage.
 * - Self-upload: Direct upload to Storage → resize extension processes → Cloud Function updates Firestore
 * - Admin/coach upload for member: Calls Cloud Function which handles Storage upload + Firestore update
 *
 * Upload path: profilePictures/{userId}/profile.jpg
 * Resized output: profilePictures/{userId}/customProfilePictures/profile_200x200.png (by resize extension)
 */

import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";

import { functions, storage } from "./core/firebase";
import type { ProfilePictureUploadResult } from "./types/user";

/**
 * Upload the current user's own profile picture.
 * Uploads directly to Firebase Storage. The resize extension will process it,
 * then the onProfilePictureResized Cloud Function will update Firestore everywhere.
 */
export async function uploadOwnProfilePicture(
  userId: string,
  imageUri: string,
): Promise<ProfilePictureUploadResult> {
  try {
    // 1. Fetch the image as a blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // 2. Upload to profilePictures/{userId}/profile.jpg
    const storageRef = ref(storage, `profilePictures/${userId}/profile.jpg`);
    await uploadBytes(storageRef, blob, {
      contentType: "image/jpeg",
    });

    // 3. Construct the predicted resized image URL
    //    Extension outputs to: profilePictures/{userId}/customProfilePictures/profile_200x200.png
    //    Uses GCS public URL format (works because MAKE_PUBLIC=true on resize extension)
    const bucket = "sportnizer.firebasestorage.app";
    const cacheBuster = Date.now();
    const photoURL = `https://storage.googleapis.com/${bucket}/profilePictures/${userId}/customProfilePictures/profile_200x200.png?t=${cacheBuster}`;

    return {
      success: true,
      photoURL,
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
    // 1. Fetch the image and convert to base64 (Cloud Functions can't receive blobs)
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // 2. Call the Cloud Function
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
