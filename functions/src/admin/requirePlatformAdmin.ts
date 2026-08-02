import * as admin from "firebase-admin";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";

/**
 * Reusable middleware that verifies the caller is a platform admin.
 *
 * Checks:
 * 1. The request is authenticated (has a valid auth token).
 * 2. The corresponding `users/{uid}` Firestore document exists.
 * 3. The user has `platformAdmin === true`.
 *
 * Throws `HttpsError` on failure; returns the user profile data on success.
 */
export async function requirePlatformAdmin(
  request: CallableRequest,
): Promise<admin.firestore.DocumentData> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const userDoc = await admin
    .firestore()
    .collection("users")
    .doc(request.auth.uid)
    .get();

  if (!userDoc.exists || !userDoc.data()?.platformAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Platform admin access required",
    );
  }

  return userDoc.data()!;
}

/**
 * Safely serialise a Firestore Timestamp (or Date, or anything with
 * `.toDate()` / `.toMillis()`) to an ISO string.  Returns `null` for
 * falsy inputs so callers never have to guard against missing fields.
 */
export function serializeTimestamp(value: any): string | null {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}
