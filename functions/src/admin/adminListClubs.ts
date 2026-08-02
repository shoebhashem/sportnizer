import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { requirePlatformAdmin, serializeTimestamp } from "./requirePlatformAdmin";

interface AdminListClubsRequest {
  limit?: number;
  startAfter?: string;
  searchQuery?: string;
}

interface ClubSummary {
  id: string;
  name: string;
  memberCount: number;
  isActive: boolean;
  location: string | null;
  createdAt: string | null;
  createdBy: string | null;
  subscriptionTier: string | null;
  stripeStatus: string | null;
}

interface AdminListClubsResponse {
  success: boolean;
  clubs: ClubSummary[];
  hasMore: boolean;
  error?: string;
}

/**
 * Lists clubs for the admin monitoring panel with optional search and
 * cursor-based pagination.
 *
 * Search uses a Firestore-compatible case-insensitive prefix match on
 * the `name` field (>= query, < query + next char boundary).
 */
export const adminListClubs = onCall(
  { region: config.region },
  async (request): Promise<AdminListClubsResponse> => {
    try {
      await requirePlatformAdmin(request);

      const {
        limit: requestedLimit,
        startAfter,
        searchQuery,
      } = (request.data || {}) as AdminListClubsRequest;

      const db = admin.firestore();
      const pageSize = Math.min(Math.max(requestedLimit || 50, 1), 200);

      let query: admin.firestore.Query = db.collection("clubs");

      // Apply prefix search when a search query is provided.
      if (searchQuery && searchQuery.trim().length > 0) {
        const trimmed = searchQuery.trim();
        const startAt = trimmed;
        // Build the upper-bound by incrementing the last character code point.
        const endAt =
          trimmed.slice(0, -1) +
          String.fromCharCode(trimmed.charCodeAt(trimmed.length - 1) + 1);

        query = query
          .where("name", ">=", startAt)
          .where("name", "<", endAt)
          .orderBy("name");
      } else {
        query = query.orderBy("name");
      }

      // Cursor-based pagination using a club document ID.
      if (startAfter) {
        const cursorDoc = await db.collection("clubs").doc(startAfter).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      // Fetch one extra to determine whether more pages exist.
      const snapshot = await query.limit(pageSize + 1).get();

      const hasMore = snapshot.docs.length > pageSize;
      const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

      const clubs: ClubSummary[] = docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name ?? "",
          memberCount: d.memberCount ?? 0,
          isActive: d.isActive !== false,
          location: d.location ?? null,
          createdAt: serializeTimestamp(d.createdAt),
          createdBy: d.createdBy ?? null,
          subscriptionTier: d.subscription?.tier ?? d.subscriptionTier ?? null,
          stripeStatus: d.stripe?.status ?? d.stripeStatus ?? null,
        };
      });

      return { success: true, clubs, hasMore };
    } catch (error) {
      console.error("Error in adminListClubs:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to list clubs");
    }
  },
);
