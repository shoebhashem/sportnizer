import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    AddNewsCommentRequest,
    AddNewsCommentResponse,
    NewsComment,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Adds a comment to a news item
 *
 * Permission: User must be a recipient of the news item OR a club-admin
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('permission-denied') - User not a recipient or club-admin
 * @throws HttpsError('not-found') - News item not found
 * @throws HttpsError('invalid-argument') - Missing or invalid fields
 */
export const addNewsComment = onCall(
  { region: config.region },
  async (request): Promise<AddNewsCommentResponse> => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data = request.data as AddNewsCommentRequest;

      validateRequiredFields(data, ["newsId", "clubId", "text"]);

      const text = data.text.trim();
      if (text.length === 0) {
        throw new HttpsError(
          "invalid-argument",
          "Comment text cannot be empty",
        );
      }
      if (text.length > 500) {
        throw new HttpsError(
          "invalid-argument",
          "Comment must be 500 characters or less",
        );
      }

      const db = admin.firestore();

      // Fetch the news document
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

      // Permission check: user must be a recipient OR club-admin
      const isRecipient = newsData.recipientUserIds?.includes(userId);

      let isClubAdmin = false;
      if (!isRecipient) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === data.clubId,
        );
        isClubAdmin = clubAccess?.role === "club-admin";
      }

      if (!isRecipient && !isClubAdmin) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to comment on this news item",
        );
      }

      // Get user display name
      const userDoc = await db.collection("users").doc(userId).get();
      const userName =
        userDoc.data()?.fullName ||
        userDoc.data()?.displayName ||
        userDoc.data()?.email ||
        "Unknown";

      // Create the comment
      const commentRef = newsRef.collection("comments").doc();
      const comment: NewsComment = {
        commentId: commentRef.id,
        newsId: data.newsId,
        clubId: data.clubId,
        text,
        createdBy: userId,
        createdByName: userName,
        createdAt: FieldValue.serverTimestamp(),
      };

      // Write comment and increment count in a batch
      const batch = db.batch();
      batch.set(commentRef, comment);
      batch.update(newsRef, {
        commentCount: FieldValue.increment(1),
      });
      await batch.commit();

      console.log(
        `💬 Comment added to news ${data.newsId} by ${userName} (${userId})`,
      );

      return {
        success: true,
        commentId: commentRef.id,
        message: "Comment added successfully",
      };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      console.error("Error adding news comment:", error);
      throw new HttpsError("internal", "Failed to add comment");
    }
  },
);
