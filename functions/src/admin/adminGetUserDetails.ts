import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { requirePlatformAdmin } from "./requirePlatformAdmin";

interface AdminGetUserDetailsRequest {
  uid: string;
}

/**
 * Helper that converts every Firestore Timestamp inside an object tree to
 * an ISO-8601 string so it can travel over the wire.
 */
function deepSerializeTimestamps(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  if (typeof obj.toDate === "function") {
    return obj.toDate().toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSerializeTimestamps);
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[key] = deepSerializeTimestamps(obj[key]);
  }
  return result;
}

interface AdminGetUserDetailsResponse {
  success: boolean;
  user: Record<string, any> | null;
  notificationsCount: number;
  error?: string;
}

/**
 * Returns the full user document for a given UID, plus a count of their
 * notifications subcollection.
 */
export const adminGetUserDetails = onCall(
  { region: config.region },
  async (request): Promise<AdminGetUserDetailsResponse> => {
    try {
      await requirePlatformAdmin(request);

      const { uid } = (request.data || {}) as AdminGetUserDetailsRequest;

      if (!uid) {
        throw new HttpsError("invalid-argument", "uid is required");
      }

      const db = admin.firestore();
      const userRef = db.collection("users").doc(uid);

      // Fetch user document and notification count in parallel.
      const [userDoc, notificationsSnapshot] = await Promise.all([
        userRef.get(),
        userRef.collection("notifications").select().get(),
      ]);

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const userData = deepSerializeTimestamps({
        uid: userDoc.id,
        ...userDoc.data(),
      });

      return {
        success: true,
        user: userData,
        notificationsCount: notificationsSnapshot.size,
      };
    } catch (error) {
      console.error("Error in adminGetUserDetails:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to get user details");
    }
  },
);
