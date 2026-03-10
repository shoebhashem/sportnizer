/**
 * Image compression utility.
 *
 * Resizes and compresses images before upload to reduce payload size.
 * Uses expo-image-manipulator which works on all platforms (iOS, Android, Web).
 */

import * as ImageManipulator from "expo-image-manipulator";

/**
 * Maximum dimension (width or height) for uploaded images.
 * 800px is plenty for profile pictures / logos displayed at ≤200px.
 */
const MAX_DIMENSION = 800;

/**
 * JPEG compression quality (0–1). 0.7 balances quality vs. file size well;
 * the resize extension will further process it to 200×200 on the server.
 */
const COMPRESS_QUALITY = 0.7;

/**
 * Compress an image URI to a smaller JPEG.
 *
 * @param uri - The local image URI (from ImagePicker or camera)
 * @returns The URI of the compressed image (a temporary local file)
 */
export async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION } }],
      {
        compress: COMPRESS_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return result.uri;
  } catch (error) {
    console.warn("Image compression failed, using original:", error);
    // Fall back to original URI if compression fails
    return uri;
  }
}
