import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    ToggleCommentReactionRequest,
    ToggleCommentReactionResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

const ALLOWED_EMOJIS = ["👍", "❤️", "🎉", "👏", "🏆"];

/**
 * Toggles an emoji reaction on a news comment for the current user.
 *
 * Reactions are stored as an embedded map on the comment document:
 *   reactions:      { [userId]: emoji }
 *   reactionCounts: { [emoji]: count }
 *
 * Behaviour:
 *  - No existing reaction   → adds reaction, increments reactionCounts[emoji]
 *  - Same emoji already set → removes reaction, decrements reactionCounts[emoji]
 *  - Different emoji set    → swaps: removes old, adds new, adjusts both counts
 *
 * Permission: User must be a recipient of the parent news item OR a club-admin
 */
export const toggleCommentReaction = onCall(
  { region: config.region },
  async (request): Promise<ToggleCommentReactionResponse> => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data = request.data as ToggleCommentReactionRequest;

      validateRequiredFields(data, ["newsId", "clubId", "commentId", "emoji"]);

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
      // Always fetch user doc so we can store displayName in reactorNames
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
          "You do not have permission to react to this comment",
        );
      }

      const commentRef = newsRef.collection("comments").doc(data.commentId);
      const commentDoc = await commentRef.get();

      if (!commentDoc.exists) {
        throw new HttpsError("not-found", "Comment not found");
      }

      const commentData = commentDoc.data()!;
      const existingEmoji: string | undefined = commentData.reactions?.[userId];

      if (!existingEmoji) {
        // No existing reaction — add
        await commentRef.update({
          [`reactions.${userId}`]: data.emoji,
          [`reactorNames.${userId}`]: displayName,
          [`reactionCounts.${data.emoji}`]: FieldValue.increment(1),
        });
        return { success: true, action: "added", emoji: data.emoji };
      }

      if (existingEmoji === data.emoji) {
        // Same emoji — remove (toggle off)
        await commentRef.update({
          [`reactions.${userId}`]: FieldValue.delete(),
          [`reactorNames.${userId}`]: FieldValue.delete(),
          [`reactionCounts.${data.emoji}`]: FieldValue.increment(-1),
        });
        return { success: true, action: "removed", emoji: data.emoji };
      }

      // Different emoji — swap (keep name, just update emoji)
      await commentRef.update({
        [`reactions.${userId}`]: data.emoji,
        [`reactorNames.${userId}`]: displayName,
        [`reactionCounts.${existingEmoji}`]: FieldValue.increment(-1),
        [`reactionCounts.${data.emoji}`]: FieldValue.increment(1),
      });
      return { success: true, action: "changed", emoji: data.emoji };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Error in toggleCommentReaction:", error);
      throw new HttpsError("internal", "An unexpected error occurred");
    }
  },
);
