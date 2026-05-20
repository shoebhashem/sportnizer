/**
 * News Reactions Service
 *
 * Handles toggling emoji reactions on news items and listening
 * for the current user's own reaction in real-time.
 */

import { db, functions } from "@/services/core/firebase";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export const REACTION_EMOJIS = ["👍", "❤️", "🎉", "👏", "🏆"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface NewsReactionEntry {
  userId: string;
  displayName: string;
  emoji: ReactionEmoji;
}

export interface NewsReactionResult {
  success: boolean;
  action?: "added" | "removed" | "changed";
  emoji?: string;
  error?: string;
}

/**
 * Toggle the current user's emoji reaction on a news item.
 */
export async function toggleNewsReaction(
  newsId: string,
  clubId: string,
  emoji: ReactionEmoji,
): Promise<NewsReactionResult> {
  try {
    const fn = httpsCallable(functions, "toggleNewsReaction");
    const result = await fn({ newsId, clubId, emoji });
    return result.data as NewsReactionResult;
  } catch (error: any) {
    console.error("Error toggling news reaction:", error);
    return {
      success: false,
      error: error.message || "Failed to update reaction",
    };
  }
}

/**
 * Attach a real-time listener for the current user's own reaction on a news item.
 * Returns null when the user has no reaction.
 */
export function attachUserNewsReactionListener(
  clubId: string,
  newsId: string,
  userId: string,
  onUpdate: (emoji: ReactionEmoji | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const reactionRef = doc(
    db,
    "clubs",
    clubId,
    "news",
    newsId,
    "reactions",
    userId,
  );
  return onSnapshot(
    reactionRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate((snap.data()?.emoji as ReactionEmoji) ?? null);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error("Error listening to user news reaction:", error);
      onError?.(error);
    },
  );
}

/**
 * Fetch all reactions for a news item.
 * Returns an array of { userId, displayName, emoji } entries.
 */
export async function fetchNewsReactions(
  clubId: string,
  newsId: string,
): Promise<NewsReactionEntry[]> {
  const reactionsRef = collection(
    db,
    "clubs",
    clubId,
    "news",
    newsId,
    "reactions",
  );
  const snap = await getDocs(reactionsRef);
  const results: NewsReactionEntry[] = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.emoji) {
      results.push({
        userId: d.id,
        displayName: data.displayName || "Member",
        emoji: data.emoji as ReactionEmoji,
      });
    }
  });
  return results;
}
