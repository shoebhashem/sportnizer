import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    DeleteNewsCommentRequest,
    DeleteNewsCommentResponse,
} from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";

/**
 * Deletes a comment from a news item
 *
 * Permission: User must be:
 * - The comment author, OR
 * - The news creator, OR
 * - A club-admin, OR
 * - A group admin/coach (for group/subgroup-level news)
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('permission-denied') - User lacks delete permission
 * @throws HttpsError('not-found') - News or comment not found
 * @throws HttpsError('invalid-argument') - Missing required fields
 */
export const deleteNewsComment = onCall(
  { region: config.region },
  async (request): Promise<DeleteNewsCommentResponse> => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const data = request.data as DeleteNewsCommentRequest;

      validateRequiredFields(data, ["newsId", "clubId", "commentId"]);

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

      // Fetch the comment
      const commentRef = newsRef.collection("comments").doc(data.commentId);
      const commentDoc = await commentRef.get();

      if (!commentDoc.exists) {
        throw new HttpsError("not-found", "Comment not found");
      }

      const commentData = commentDoc.data()!;

      // Permission check
      const isCommentAuthor = commentData.createdBy === userId;
      const isNewsCreator = newsData.createdBy === userId;

      let isClubAdmin = false;
      let isGroupAdminOrCoach = false;

      if (!isCommentAuthor && !isNewsCreator) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        const clubAccess = userData?.clubAccess?.find(
          (ca: any) => ca.clubId === data.clubId,
        );

        isClubAdmin = clubAccess?.role === "club-admin";

        // Check group admin/coach for group/subgroup-level news
        if (
          !isClubAdmin &&
          newsData.targetScope?.groupId &&
          clubAccess?.groupAccess
        ) {
          const groupAccess = clubAccess.groupAccess.find(
            (g: any) => g.groupId === newsData.targetScope.groupId,
          );
          if (groupAccess) {
            isGroupAdminOrCoach =
              groupAccess.roles?.includes("admin") ||
              groupAccess.roles?.includes("coach");
          }
        }
      }

      if (
        !isCommentAuthor &&
        !isNewsCreator &&
        !isClubAdmin &&
        !isGroupAdminOrCoach
      ) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to delete this comment",
        );
      }

      // Delete comment and decrement count in a batch
      const batch = db.batch();
      batch.delete(commentRef);
      batch.update(newsRef, {
        commentCount: FieldValue.increment(-1),
      });
      await batch.commit();

      console.log(
        `🗑️ Comment ${data.commentId} deleted from news ${data.newsId} by user ${userId}`,
      );

      return {
        success: true,
        message: "Comment deleted successfully",
      };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      console.error("Error deleting news comment:", error);
      throw new HttpsError("internal", "Failed to delete comment");
    }
  },
);
