// /functions/src/notifications/sendPushNotification.ts
// Internal backend helper for dispatching Expo push notifications.
//
// Architecture:
// - Called by createNotificationDirect() AFTER the Firestore write succeeds
// - Fire-and-forget: push failures never fail the Firestore notification write
// - Reads push tokens from users/{userId}/pushTokens subcollection
// - Sends via Expo Push API (https://exp.host/--/api/v2/push/send)
// - Cleans up invalid/expired tokens automatically (DeviceNotRegistered)
// - Maps notification priority + type → Android channel ID

import * as admin from "firebase-admin";
import { NotificationType } from "../types/interfaces";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: "low" | "normal" | "high";
  type?: NotificationType;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: "default" | "normal" | "high";
  channelId?: string; // Android only
  categoryIdentifier?: string; // iOS only
  sound?: "default" | null;
  badge?: number;
}

interface ExpoPushTicket {
  id?: string;
  status: "ok" | "error";
  message?: string;
  details?: {
    error?:
      | "DeviceNotRegistered"
      | "InvalidCredentials"
      | "MessageTooBig"
      | "MessageRateExceeded";
  };
}

interface ExpoPushResponse {
  data: ExpoPushTicket[];
}

// ---------------------------------------------------------------------------
// Notification type → Android channel mapping
// ---------------------------------------------------------------------------

const CHANNEL_MAP: Partial<Record<NotificationType, string>> = {
  event: "events",
  event_cancelled: "events",
  group_invitation: "invitations",
  youth_member_invitation: "invitations",
  club_admin_invitation: "invitations",
  news: "news",
  news_updated: "news",
  payment_request: "payments",
  role_changed: "invitations",
  announcement: "default",
};

function getChannelId(type?: NotificationType): string {
  if (!type) return "default";
  return CHANNEL_MAP[type] ?? "default";
}

function mapPriority(
  priority?: "low" | "normal" | "high",
): "default" | "normal" | "high" {
  if (priority === "high") return "high";
  if (priority === "low") return "normal";
  return "default";
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Send a push notification to all registered devices for a user.
 *
 * - No-op if the user has no push tokens (graceful degradation)
 * - Removes invalid/expired tokens automatically
 * - Never throws — all errors are logged and swallowed
 *
 * @param userId - Target Firebase user ID
 * @param payload - Notification content and metadata
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const db = admin.firestore();

    // Fetch all registered push tokens for this user
    const tokensSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("pushTokens")
      .get();

    if (tokensSnapshot.empty) {
      // User has no registered devices — in-app notification already written
      console.log(`ℹ️ No push tokens registered for user ${userId}`);
      return;
    }

    const tokens = tokensSnapshot.docs.map((doc) => ({
      id: doc.id,
      token: doc.data().token as string,
    }));

    const channelId = getChannelId(payload.type);
    const expoPriority = mapPriority(payload.priority);
    const sound = payload.priority === "high" ? "default" : "default";

    // Build Expo push messages (one per token)
    const messages: ExpoPushMessage[] = tokens.map(({ token }) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      priority: expoPriority,
      channelId, // Android: route to correct notification channel
      categoryIdentifier: channelId, // iOS: set notification category
      sound,
    }));

    // Send to Expo Push API
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error(
        `❌ Expo Push API returned status ${response.status} for user ${userId}`,
      );
      return;
    }

    const result = (await response.json()) as ExpoPushResponse;

    // Process tickets — remove invalid tokens
    const invalidTokenIds: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    result.data.forEach((ticket, index) => {
      if (ticket.status === "ok") {
        successCount += 1;
        return;
      }

      errorCount += 1;

      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered"
      ) {
        const tokenId = tokens[index]?.id;
        if (tokenId) {
          invalidTokenIds.push(tokenId);
        }
        console.log(
          `📲 Removing invalid push token ${tokens[index]?.token} for user ${userId}`,
        );
        return;
      }

      console.error(
        `❌ Push ticket error for user ${userId}, token ${tokens[index]?.token}: ${ticket.details?.error ?? "unknown"} - ${ticket.message ?? "No message"}`,
      );
    });

    // Clean up invalid tokens in Firestore
    if (invalidTokenIds.length > 0) {
      const batch = db.batch();
      invalidTokenIds.forEach((tokenId) => {
        const ref = db
          .collection("users")
          .doc(userId)
          .collection("pushTokens")
          .doc(tokenId);
        batch.delete(ref);
      });
      await batch.commit();
    }

    console.log(
      `✅ Push dispatch completed for user ${userId}: ${successCount}/${tokens.length} successful, ${errorCount} errors`,
    );
  } catch (error) {
    // Push failures must never propagate — the Firestore notification is already written
    console.error(
      `❌ Push notification failed for user ${userId} (non-fatal):`,
      error,
    );
  }
}
