import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { requirePlatformAdmin, serializeTimestamp } from "./requirePlatformAdmin";

interface AdminListUsersRequest {
  limit?: number;
  startAfter?: string;
  searchQuery?: string;
}

interface UserSummary {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  clubAccess: { clubId: string; clubName: string }[];
  createdAt: string | null;
  platformAdmin: boolean;
  emailVerified: boolean;
}

interface AdminListUsersResponse {
  success: boolean;
  users: UserSummary[];
  hasMore: boolean;
  error?: string;
}

/**
 * Lists user profiles for the admin monitoring panel.
 *
 * Supports two search modes (determined automatically):
 * - If `searchQuery` contains an `@` it is treated as an exact email match.
 * - Otherwise it is treated as a display-name prefix search using the
 *   standard Firestore `>=` / `<` range trick.
 *
 * Pagination is cursor-based via `startAfter` (a user document ID).
 */
export const adminListUsers = onCall(
  { region: config.region },
  async (request): Promise<AdminListUsersResponse> => {
    try {
      await requirePlatformAdmin(request);

      const {
        limit: requestedLimit,
        startAfter,
        searchQuery,
      } = (request.data || {}) as AdminListUsersRequest;

      const db = admin.firestore();
      const pageSize = Math.min(Math.max(requestedLimit || 50, 1), 200);

      let query: admin.firestore.Query = db.collection("users");
      const trimmed = searchQuery?.trim() ?? "";

      if (trimmed.length > 0) {
        if (trimmed.includes("@")) {
          // Exact email match.
          query = query.where("email", "==", trimmed).orderBy("email");
        } else {
          // Display-name prefix search.
          const startAt = trimmed;
          const endAt =
            trimmed.slice(0, -1) +
            String.fromCharCode(
              trimmed.charCodeAt(trimmed.length - 1) + 1,
            );

          query = query
            .where("displayName", ">=", startAt)
            .where("displayName", "<", endAt)
            .orderBy("displayName");
        }
      } else {
        query = query.orderBy("displayName");
      }

      // Cursor-based pagination.
      if (startAfter) {
        const cursorDoc = await db.collection("users").doc(startAfter).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      // Fetch one extra row to know if there is another page.
      const snapshot = await query.limit(pageSize + 1).get();
      const hasMore = snapshot.docs.length > pageSize;
      const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

      const users: UserSummary[] = docs.map((doc) => {
        const d = doc.data();

        // Build a compact club-access summary.
        const clubAccessRaw: any[] = d.clubAccess ?? [];
        const clubAccess = clubAccessRaw.map((ca: any) => ({
          clubId: ca.clubId ?? "",
          clubName: ca.clubName ?? "",
        }));

        return {
          uid: doc.id,
          displayName: d.displayName ?? null,
          email: d.email ?? null,
          photoURL: d.photoURL ?? null,
          clubAccess,
          createdAt: serializeTimestamp(d.createdAt),
          platformAdmin: d.platformAdmin === true,
          emailVerified: d.emailVerified === true,
        };
      });

      return { success: true, users, hasMore };
    } catch (error) {
      console.error("Error in adminListUsers:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to list users");
    }
  },
);
