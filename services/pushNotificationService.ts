// /services/pushNotificationService.ts
// Handles Expo push token registration, token persistence in Firestore,
// Android notification channels, and iOS notification categories.
//
// Architecture:
// - Tokens stored in users/{userId}/pushTokens/{tokenId} subcollection
// - One user can have multiple tokens (multiple devices)
// - Tokens are cleaned up on logout and refreshed on every app launch
// - Push failures on the backend never fail Firestore notification writes

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import {
    addDoc,
    collection,
    deleteDoc,
    getDocs,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";
import { Platform } from "react-native";
import { db } from "./core/firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushTokenDocument {
  token: string;
  platform: "android" | "ios";
  createdAt: any;
  updatedAt: any;
}

// ---------------------------------------------------------------------------
// Notification Channel / Category IDs
// ---------------------------------------------------------------------------

export const NOTIFICATION_CHANNELS = {
  DEFAULT: "default",
  EVENTS: "events",
  INVITATIONS: "invitations",
  NEWS: "news",
  PAYMENTS: "payments",
} as const;

// ---------------------------------------------------------------------------
// Setup: Android Channels + iOS Categories
// Called once on app launch (before requesting permission)
// ---------------------------------------------------------------------------

/**
 * Set up Android notification channels and iOS notification categories.
 * Channels are visible to the user in Android system settings.
 * Categories allow iOS to group notifications by type.
 *
 * Safe to call on web (no-op).
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === "web") return;

  if (Platform.OS === "android") {
    await Promise.all([
      Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.DEFAULT, {
        name: "General",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#25292e",
      }),
      Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.EVENTS, {
        name: "Events",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#25292e",
      }),
      Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.INVITATIONS,
        {
          name: "Invitations",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#25292e",
          sound: "default",
        },
      ),
      Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.NEWS, {
        name: "News",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: "#25292e",
        sound: undefined, // Silent for news
      }),
      Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.PAYMENTS,
        {
          name: "Payments",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 500, 250, 500],
          lightColor: "#25292e",
          sound: "default",
        },
      ),
    ]);
  }

  if (Platform.OS === "ios") {
    await Promise.all([
      Notifications.setNotificationCategoryAsync(
        NOTIFICATION_CHANNELS.EVENTS,
        [],
      ),
      Notifications.setNotificationCategoryAsync(
        NOTIFICATION_CHANNELS.INVITATIONS,
        [],
      ),
      Notifications.setNotificationCategoryAsync(
        NOTIFICATION_CHANNELS.NEWS,
        [],
      ),
      Notifications.setNotificationCategoryAsync(
        NOTIFICATION_CHANNELS.PAYMENTS,
        [],
      ),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Permission + Token Registration
// ---------------------------------------------------------------------------

/**
 * Request push notification permission and get the Expo push token.
 *
 * Must only be called on a real device — simulators do not support push tokens.
 * Returns null if:
 * - Running on simulator
 * - User denies permission
 * - Running on web
 *
 * @returns Expo push token string, or null
 */
export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  if (Platform.OS === "web") return null;

  if (!Device.isDevice) {
    console.log(
      "📲 Push notifications are not supported on emulators/simulators",
    );
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("🔕 Push notification permission denied");
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "09d2cd34-930b-479f-b9c0-1570da24a702",
    });
    return tokenData.data;
  } catch (error) {
    console.error("❌ Failed to get Expo push token:", error);
    return null;
  }
}

/**
 * Check current push notification permission status without prompting.
 * Used to show a nudge banner when permission was previously denied.
 */
export async function getPushPermissionStatus(): Promise<
  "granted" | "denied" | "undetermined"
> {
  if (Platform.OS === "web") return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// ---------------------------------------------------------------------------
// Token Persistence (Firestore)
// ---------------------------------------------------------------------------

/**
 * Save an Expo push token to Firestore for the given user.
 * No-op if the token already exists (idempotent).
 *
 * Stored at: users/{userId}/pushTokens/{auto-id}
 */
export async function savePushTokenToFirestore(
  userId: string,
  token: string,
): Promise<void> {
  try {
    const tokensRef = collection(db, "users", userId, "pushTokens");

    // Check if token already exists to avoid duplicates
    const existing = await getDocs(
      query(tokensRef, where("token", "==", token)),
    );
    if (!existing.empty) {
      console.log("📲 Push token already saved, skipping");
      return;
    }

    await addDoc(tokensRef, {
      token,
      platform: Platform.OS as "android" | "ios",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies PushTokenDocument);

    console.log("✅ Push token saved to Firestore");
  } catch (error) {
    // Non-fatal — push token registration failure should not crash the app
    console.error("❌ Failed to save push token:", error);
  }
}

/**
 * Remove a specific push token from Firestore on logout.
 * This prevents sending pushes to devices the user has logged out from.
 */
export async function removePushTokenFromFirestore(
  userId: string,
  token: string,
): Promise<void> {
  try {
    const tokensRef = collection(db, "users", userId, "pushTokens");
    const snapshot = await getDocs(
      query(tokensRef, where("token", "==", token)),
    );

    await Promise.all(snapshot.docs.map((doc) => deleteDoc(doc.ref)));

    console.log("🗑️ Push token removed from Firestore");
  } catch (error) {
    // Non-fatal
    console.error("❌ Failed to remove push token:", error);
  }
}
