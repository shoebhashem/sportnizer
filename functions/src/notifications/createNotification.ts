import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { NotificationType } from "../types/interfaces";
import { config } from "../utils/config";
import { validateRequiredFields } from "../utils/validation";
import { sendPushNotification } from "./sendPushNotification";

export interface CreateNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;

  // Source reference (links back to source of truth)
  invitationToken?: string; // For group invitations
  sourceId?: string; // Generic reference to source document
  sourceCollection?: string; // 'invitations' | 'announcements' | etc.

  // Context data (minimal, for display only)
  clubId: string;
  clubName: string;
  groupId?: string;
  groupName?: string;

  // Youth member data (for youth invitations)
  youthData?: {
    childName: string;
    dateOfBirth: string;
    relationship: string;
  };

  // Generic metadata for context-aware UI (payment data, role data, etc.)
  metadata?: {
    [key: string]: any;
  };

  // Optional fields
  priority?: "low" | "normal" | "high";
  actionUrl?: string; // Deep link for notification action
}

export interface CreateNotificationResponse {
  success: boolean;
  notificationId?: string;
  error?: string;
}

/**
 * Creates a notification document in users/{userId}/notifications subcollection
 *
 * This is the core notification creation function used by:
 * - sendGroupInvitation (for existing user invitations)
 * - Future: announcement system, event reminders, poll notifications, etc.
 *
 * Architecture:
 * - Notifications subcollection serves as UI layer for real-time updates
 * - Links back to source of truth via sourceId/sourceCollection
 * - Lightweight data structure optimized for UI rendering
 *
 * @param request - Notification data
 * @returns Promise with notification ID on success
 *
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Target user doesn't exist
 */
export const createNotification = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CreateNotificationResponse> => {
    try {
      const {
        userId,
        type,
        title,
        message,
        invitationToken,
        sourceId,
        sourceCollection,
        clubId,
        clubName,
        groupId,
        groupName,
        priority = "normal",
        actionUrl,
      }: CreateNotificationRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, [
        "userId",
        "type",
        "title",
        "message",
        "clubId",
        "clubName",
      ]);

      // Verify the user is authenticated (admin or system can create notifications)
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "User must be authenticated to create notifications",
        );
      }

      console.log(`📬 Creating notification for user ${userId}, type: ${type}`);

      const db = admin.firestore();

      // Verify target user exists
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        console.error(`❌ User not found: ${userId}`);
        throw new HttpsError("not-found", `User ${userId} does not exist`);
      }

      // Create notification document
      const notificationRef = db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .doc();

      const notificationData = {
        // Notification metadata
        type,
        title,
        message,

        // Source reference (links back to source of truth)
        ...(invitationToken && { invitationToken }),
        ...(sourceId && { sourceId }),
        ...(sourceCollection && { sourceCollection }),

        // UI state
        read: false,
        dismissed: false,

        // Context data (minimal, for display only)
        clubId,
        clubName,
        ...(groupId && { groupId }),
        ...(groupName && { groupName }),

        // Timestamps
        createdAt: FieldValue.serverTimestamp(),

        // Optional fields
        priority,
        ...(actionUrl && { actionUrl }),
      };

      await notificationRef.set(notificationData);

      console.log(
        `✅ Notification created successfully: ${notificationRef.id} for user ${userId}`,
      );

      return {
        success: true,
        notificationId: notificationRef.id,
      };
    } catch (error: any) {
      console.error("❌ Error creating notification:", error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        "internal",
        `Failed to create notification: ${error.message}`,
      );
    }
  },
);

/**
 * Helper function to create notification directly (for internal use in other functions)
 * This bypasses the onCall wrapper for efficiency when called from other backend functions
 *
 * @param userId - Target user ID
 * @param notificationData - Notification data
 * @returns Promise with notification ID
 */
export const createNotificationDirect = async (
  userId: string,
  notificationData: Omit<CreateNotificationRequest, "userId">,
): Promise<string> => {
  // Type guard for metadata
  const hasMetadata =
    "metadata" in notificationData && notificationData.metadata !== undefined;
  const db = admin.firestore();

  // Verify target user exists
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new Error(`User ${userId} does not exist`);
  }

  // Create notification document
  const notificationRef = db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .doc();

  const notification = {
    // Notification metadata
    type: notificationData.type,
    title: notificationData.title,
    message: notificationData.message,

    // Source reference
    ...(notificationData.invitationToken && {
      invitationToken: notificationData.invitationToken,
    }),
    ...(notificationData.sourceId && { sourceId: notificationData.sourceId }),
    ...(notificationData.sourceCollection && {
      sourceCollection: notificationData.sourceCollection,
    }),

    // UI state
    read: false,
    dismissed: false,

    // Context data
    clubId: notificationData.clubId,
    clubName: notificationData.clubName,
    ...(notificationData.groupId && { groupId: notificationData.groupId }),
    ...(notificationData.groupName && {
      groupName: notificationData.groupName,
    }),

    // Metadata for context-aware UI
    ...(hasMetadata ? { metadata: (notificationData as any).metadata } : {}),

    // Timestamps
    createdAt: FieldValue.serverTimestamp(),

    // Optional fields
    priority: notificationData.priority || "normal",
    ...(notificationData.actionUrl && {
      actionUrl: notificationData.actionUrl,
    }),
  };

  await notificationRef.set(notification);

  console.log(
    `✅ Notification created directly: ${notificationRef.id} for user ${userId}`,
  );

  // Send push notification to user's registered devices (fire-and-forget)
  // Push failures must never fail the Firestore notification write
  sendPushNotification(userId, {
    title: notificationData.title,
    body: notificationData.message,
    priority: notificationData.priority || "normal",
    type: notificationData.type,
    data: {
      actionUrl: notificationData.actionUrl ?? null,
      type: notificationData.type,
      sourceId: notificationData.sourceId ?? null,
      clubId: notificationData.clubId,
      groupId: notificationData.groupId ?? null,
    },
  }).catch((err) => console.error("❌ Push send failed (non-fatal):", err));

  return notificationRef.id;
};
