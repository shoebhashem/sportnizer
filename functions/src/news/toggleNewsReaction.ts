import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    ToggleNewsReactionRequest,
    ToggleNewsReactionResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

const ALLOWED_EMOJIS = ["👍", "❤️", "🎉", "👏", "🏆"];

/**
 * Toggles an emoji reaction on a news item for the current user.
 *
 * Behaviour:
 *  - No existing reaction   → adds reaction, increments reactionCounts[emoji]
 *  - Same emoji already set → removes reaction, decrements reactionCounts[emoji]
 *  - Different emoji set    → swaps: removes old, adds new, adjusts both counts
 *
 * Permission: User must be a recipient of the news item OR a club-admin
 */
export const toggleNewsReaction = onCall(
  { region: config.region },
  async (request): Promise<ToggleNewsReactionResponse> => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data = request.data as ToggleNewsReactionRequest;

      validateRequiredFields(data, ["newsId", "clubId", "emoji"]);

      if (!ALLOWED_EMOJIS.includes(data.emoji)) {
        throw new HttpsError("invalid-argument", "Emoji not allowed");
      }

      const db = admin.firestore();

      const newsRef = db
        .collection("clubs")
        .doc(data.clubId)
        .collection("news")
        .doc(data.newsId);

      const newsDoc = await newsRef.get();
      if (!newsDoc.exists) {
        throw new HttpsError("not-found", "News item not found");
      }

      const newsData = newsDoc.data()!;

      // Permission check: recipient or club-admin
      // Always fetch user doc so we can store displayName on the reaction
      const isRecipient = newsData.recipientUserIds?.includes(userId);
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      const displayName =
        userData?.displayName ||
        userData?.name ||
        userData?.fullName ||
        "Member";
      let isClubAdmin = false;
      if (!isRecipient) {
        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === data.clubId,
        );
        isClubAdmin = clubAccess?.role === "club-admin";
      }

      if (!isRecipient && !isClubAdmin) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to react to this news item",
        );
      }

      const reactionRef = newsRef.collection("reactions").doc(userId);
      const reactionDoc = await reactionRef.get();

      const batch = db.batch();

      if (!reactionDoc.exists) {
        // No existing reaction — add new
        batch.set(reactionRef, {
          userId,
          displayName,
          emoji: data.emoji,
          reactedAt: FieldValue.serverTimestamp(),
        });
        batch.update(newsRef, {
          [`reactionCounts.${data.emoji}`]: FieldValue.increment(1),
        });
        await batch.commit();
        return { success: true, action: "added", emoji: data.emoji };
      }

      const existing = reactionDoc.data()!;

      if (existing.emoji === data.emoji) {
        // Same emoji — remove (toggle off)
        batch.delete(reactionRef);
        batch.update(newsRef, {
          [`reactionCounts.${data.emoji}`]: FieldValue.increment(-1),
        });
        await batch.commit();
        return { success: true, action: "removed", emoji: data.emoji };
      }

      // Different emoji — swap
      batch.set(reactionRef, {
        userId,
        displayName,
        emoji: data.emoji,
        reactedAt: FieldValue.serverTimestamp(),
      });
      batch.update(newsRef, {
        [`reactionCounts.${existing.emoji}`]: FieldValue.increment(-1),
        [`reactionCounts.${data.emoji}`]: FieldValue.increment(1),
      });
      await batch.commit();
      return { success: true, action: "changed", emoji: data.emoji };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Error in toggleNewsReaction:", error);
      throw new HttpsError("internal", "An unexpected error occurred");
    }
  },
);
