/**
 * waitForResizedImage - Utility for Cloud Functions
 *
 * After uploading an image to Firebase Storage, the resize extension runs
 * asynchronously. This utility polls for the resized image to actually exist
 * before returning the URL, preventing race conditions where the client
 * receives a URL pointing to a file that doesn't exist yet.
 */

import * as admin from "firebase-admin";

/**
 * Wait for a resized image to exist in Storage, then return its public URL
 * with a fresh cache-buster timestamp.
 *
 * @param bucketName - The Storage bucket name
 * @param resizedPath - The expected path of the resized image (e.g. "profilePictures/users/{id}/customProfilePictures/profile_200x200.png")
 * @param maxWaitMs - Maximum time to wait (default: 15 seconds)
 * @param pollIntervalMs - Time between polls (default: 1.5 seconds)
 * @returns The public URL with a cache-buster, or a predicted URL if timeout is reached
 */
export async function waitForResizedImage(
  bucketName: string,
  resizedPath: string,
  maxWaitMs: number = 15000,
  pollIntervalMs: number = 1500,
): Promise<string> {
  const bucket = admin.storage().bucket(bucketName);
  const file = bucket.file(resizedPath);

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const [exists] = await file.exists();
      if (exists) {
        // Set Cache-Control on the resized image too (the extension may not set it)
        try {
          await file.setMetadata({
            cacheControl: "no-cache, max-age=0",
          });
        } catch {
          // Non-critical — the resize extension may set its own metadata
        }

        const cacheBuster = Date.now();
        return `https://storage.googleapis.com/${bucketName}/${resizedPath}?t=${cacheBuster}`;
      }
    } catch {
      // File doesn't exist yet, keep polling
    }

    await sleep(pollIntervalMs);
  }

  // Timeout reached — return predicted URL anyway (client will retry on display)
  console.warn(
    `⚠️ Timed out waiting for resized image at ${resizedPath} after ${maxWaitMs}ms`,
  );
  const cacheBuster = Date.now();
  return `https://storage.googleapis.com/${bucketName}/${resizedPath}?t=${cacheBuster}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
