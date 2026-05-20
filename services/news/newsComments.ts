/**
 * News Comments Service
 *
 * Handles adding, deleting, and fetching comments on news items.
 * Uses Cloud Functions for writes, direct Firestore reads for fetching.
 */

import { db, functions } from "@/services/core/firebase";
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// ===============================================================================
// TYPESCRIPT INTERFACES
// ===============================================================================

export interface NewsCommentClient {
  commentId: string;
  newsId: string;
  clubId: string;
  text: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  /** Map of userId → emoji for embedded comment reactions */
  reactions?: Record<string, string>;
  /** Denormalized counts — keyed by emoji (e.g. { "👍": 2 }) */
  reactionCounts?: Record<string, number>;
  /** Map of userId → displayName for the reactor name lookup */
  reactorNames?: Record<string, string>;
}

// ===============================================================================
// NEWS COMMENTS SERVICE
// ===============================================================================

/**
 * Attach a real-time listener for comments on a news item
 */
export function attachNewsCommentsListener(
  clubId: string,
  newsId: string,
  onCommentsUpdate: (comments: NewsCommentClient[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const commentsRef = collection(
    db,
    "clubs",
    clubId,
    "news",
    newsId,
    "comments",
  );
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const comments: NewsCommentClient[] = snapshot.docs.map((doc) => ({
        commentId: doc.id,
        ...doc.data(),
      })) as NewsCommentClient[];
      onCommentsUpdate(comments);
    },
    (error) => {
      console.error("Error listening to news comments:", error);
      onError?.(error);
    },
  );
}

/**
 * Add a comment to a news item via Cloud Function
 */
export async function addNewsComment(
  newsId: string,
  clubId: string,
  text: string,
): Promise<{ success: boolean; commentId?: string; error?: string }> {
  try {
    const fn = httpsCallable(functions, "addNewsComment");
    const result = await fn({ newsId, clubId, text });
    return result.data as {
      success: boolean;
      commentId?: string;
      error?: string;
    };
  } catch (error: any) {
    console.error("Error adding news comment:", error);
    return {
      success: false,
      error: error.message || "Failed to add comment",
    };
  }
}

/**
 * Delete a comment from a news item via Cloud Function
 */
export async function deleteNewsComment(
  newsId: string,
  clubId: string,
  commentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const fn = httpsCallable(functions, "deleteNewsComment");
    const result = await fn({ newsId, clubId, commentId });
    return result.data as { success: boolean; error?: string };
  } catch (error: any) {
    console.error("Error deleting news comment:", error);
    return {
      success: false,
      error: error.message || "Failed to delete comment",
    };
  }
}

/**
 * Toggle an emoji reaction on a comment via Cloud Function
 */
export async function toggleCommentReaction(
  newsId: string,
  clubId: string,
  commentId: string,
  emoji: string,
): Promise<{
  success: boolean;
  action?: string;
  emoji?: string;
  error?: string;
}> {
  try {
    const fn = httpsCallable(functions, "toggleCommentReaction");
    const result = await fn({ newsId, clubId, commentId, emoji });
    return result.data as {
      success: boolean;
      action?: string;
      emoji?: string;
      error?: string;
    };
  } catch (error: any) {
    console.error("Error toggling comment reaction:", error);
    return {
      success: false,
      error: error.message || "Failed to update reaction",
    };
  }
}
