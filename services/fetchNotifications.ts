// /services/fetchNotifications.ts - Real-time notification fetching and management
// Provides Firestore listeners for real-time notification updates

import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { db } from "./core/firebase";

/**
 * Notification type definition matching backend
 */
export type NotificationType =
  | "group_invitation"
  | "youth_member_invitation"
  | "announcement"
  | "event"
  | "poll"
  | "role_changed"
  | "member_joined"
  | "event_cancelled"
  | "payment_request";

/**
 * Notification data structure matching Firestore document
 */
export interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;

  // Source reference (links back to source of truth)
  invitationToken?: string;
  sourceId?: string;
  sourceCollection?: string;

  // UI state
  read: boolean;
  dismissed: boolean;

  // Context data
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

  // Payment data (for payment_request notifications)
  metadata?: {
    feeId?: string;
    beneficiaryId?: string;
    beneficiaryName?: string;
    amount?: number;
    currency?: string;
    dueDate?: any;
    [key: string]: any;
  };

  // Timestamps
  createdAt: Timestamp | any;
  readAt?: Timestamp | any;
  actionTakenAt?: Timestamp | any;

  // Optional fields
  priority?: "low" | "normal" | "high";
  actionUrl?: string;
}

/**
 * Subscribe to real-time notifications for a user
 * Returns an unsubscribe function to clean up the listener
 *
 * @param userId - User ID to fetch notifications for
 * @param onNotificationsUpdate - Callback fired when notifications change
 * @param onError - Optional callback for errors
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * const unsubscribe = subscribeToUserNotifications(
 *   user.uid,
 *   (notifications) => {
 *     setNotifications(notifications);
 *     const unreadCount = notifications.filter(n => !n.read).length;
 *     setBadgeCount(unreadCount);
 *   },
 *   (error) => console.error('Notification error:', error)
 * );
 *
 * // Clean up on unmount
 * return () => unsubscribe();
 * ```
 */
export const subscribeToUserNotifications = (
  userId: string,
  onNotificationsUpdate: (notifications: NotificationData[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  console.log(
    `📡 Setting up real-time listener for user notifications: ${userId}`,
  );

  const notificationsRef = collection(db, "users", userId, "notifications");

  // Query for active (non-dismissed) notifications, ordered by newest first
  const q = query(
    notificationsRef,
    where("dismissed", "==", false),
    orderBy("createdAt", "desc"),
  );

  // Set up real-time listener
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const notifications: NotificationData[] = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as NotificationData,
      );

      console.log(
        `📬 Received ${notifications.length} notifications for user ${userId}`,
      );
      onNotificationsUpdate(notifications);
    },
    (error) => {
      console.error("❌ Error in notification listener:", error);
      onError?.(error);
    },
  );

  return unsubscribe;
};

/**
 * Get unread notification count for badge display
 * This is a one-time query, not a real-time listener
 *
 * @param userId - User ID
 * @returns Promise with unread count
 *
 * @example
 * ```typescript
 * const count = await getUnreadNotificationCount(user.uid);
 * setBadgeCount(count);
 * ```
 */
export const getUnreadNotificationCount = async (
  userId: string,
): Promise<number> => {
  try {
    const notificationsRef = collection(db, "users", userId, "notifications");
    const q = query(
      notificationsRef,
      where("read", "==", false),
      where("dismissed", "==", false),
    );

    const snapshot = await getDocs(q);
    const count = snapshot.size;

    console.log(`📊 Unread notification count for user ${userId}: ${count}`);
    return count;
  } catch (error) {
    console.error("❌ Error fetching unread count:", error);
    return 0;
  }
};

/**
 * Mark a notification as read
 * Updates the read flag and sets readAt timestamp
 *
 * @param userId - User ID
 * @param notificationId - Notification document ID
 * @returns Promise that resolves when update is complete
 *
 * @example
 * ```typescript
 * await markNotificationAsRead(user.uid, notification.id);
 * ```
 */
export const markNotificationAsRead = async (
  userId: string,
  notificationId: string,
): Promise<void> => {
  try {
    const notificationRef = doc(
      db,
      "users",
      userId,
      "notifications",
      notificationId,
    );
    await updateDoc(notificationRef, {
      read: true,
      readAt: serverTimestamp(),
    });

    console.log(`✅ Notification marked as read: ${notificationId}`);
  } catch (error) {
    console.error(`❌ Error marking notification as read:`, error);
    throw error;
  }
};

/**
 * Dismiss a notification (soft delete)
 * Sets dismissed flag to true, removing it from active notification list
 * Notification document remains for audit trail
 *
 * @param userId - User ID
 * @param notificationId - Notification document ID
 * @returns Promise that resolves when update is complete
 *
 * @example
 * ```typescript
 * await dismissNotification(user.uid, notification.id);
 * ```
 */
export const dismissNotification = async (
  userId: string,
  notificationId: string,
): Promise<void> => {
  try {
    const notificationRef = doc(
      db,
      "users",
      userId,
      "notifications",
      notificationId,
    );
    await updateDoc(notificationRef, {
      dismissed: true,
      actionTakenAt: serverTimestamp(),
    });

    console.log(`🗑️ Notification dismissed: ${notificationId}`);
  } catch (error) {
    console.error(`❌ Error dismissing notification:`, error);
    throw error;
  }
};

/**
 * Mark all notifications as read for a user
 * Useful for "mark all as read" functionality
 *
 * @param userId - User ID
 * @returns Promise that resolves when all updates are complete
 *
 * @example
 * ```typescript
 * await markAllNotificationsAsRead(user.uid);
 * ```
 */
export const markAllNotificationsAsRead = async (
  userId: string,
): Promise<void> => {
  try {
    const notificationsRef = collection(db, "users", userId, "notifications");
    const q = query(
      notificationsRef,
      where("read", "==", false),
      where("dismissed", "==", false),
    );

    const snapshot = await getDocs(q);

    // Update all unread notifications in parallel
    const updatePromises = snapshot.docs.map((doc) =>
      updateDoc(doc.ref, {
        read: true,
        readAt: serverTimestamp(),
      }),
    );

    await Promise.all(updatePromises);

    console.log(
      `✅ Marked ${snapshot.size} notifications as read for user ${userId}`,
    );
  } catch (error) {
    console.error(`❌ Error marking all notifications as read:`, error);
    throw error;
  }
};

/**
 * Get notification by ID
 * One-time query for a specific notification
 *
 * @param userId - User ID
 * @param notificationId - Notification document ID
 * @returns Promise with notification data or null if not found
 *
 * @example
 * ```typescript
 * const notification = await getNotificationById(user.uid, notificationId);
 * if (notification) {
 *   console.log(notification.message);
 * }
 * ```
 */
export const getNotificationById = async (
  userId: string,
  notificationId: string,
): Promise<NotificationData | null> => {
  try {
    const notificationRef = doc(
      db,
      "users",
      userId,
      "notifications",
      notificationId,
    );
    const notificationDoc = await getDocs(
      query(
        collection(db, "users", userId, "notifications"),
        where("__name__", "==", notificationId),
      ),
    );

    if (notificationDoc.empty) {
      console.log(`❌ Notification not found: ${notificationId}`);
      return null;
    }

    const docData = notificationDoc.docs[0];
    return {
      id: docData.id,
      ...docData.data(),
    } as NotificationData;
  } catch (error) {
    console.error(`❌ Error fetching notification:`, error);
    return null;
  }
};

/**
 * Filter notifications by type
 * Useful for showing specific notification types
 *
 * @param notifications - Array of notifications
 * @param type - Notification type to filter by
 * @returns Filtered array of notifications
 *
 * @example
 * ```typescript
 * const invitations = filterNotificationsByType(notifications, 'group_invitation');
 * const announcements = filterNotificationsByType(notifications, 'announcement');
 * ```
 */
export const filterNotificationsByType = (
  notifications: NotificationData[],
  type: NotificationType,
): NotificationData[] => {
  return notifications.filter((notification) => notification.type === type);
};

/**
 * Get unread notifications only
 *
 * @param notifications - Array of notifications
 * @returns Filtered array of unread notifications
 *
 * @example
 * ```typescript
 * const unread = getUnreadNotifications(notifications);
 * setBadgeCount(unread.length);
 * ```
 */
export const getUnreadNotifications = (
  notifications: NotificationData[],
): NotificationData[] => {
  return notifications.filter((notification) => !notification.read);
};

/**
 * Sort notifications by priority and date
 * High priority first, then normal, then low
 * Within each priority level, newest first
 *
 * @param notifications - Array of notifications
 * @returns Sorted array of notifications
 *
 * @example
 * ```typescript
 * const sorted = sortNotificationsByPriority(notifications);
 * ```
 */
export const sortNotificationsByPriority = (
  notifications: NotificationData[],
): NotificationData[] => {
  const priorityOrder = { high: 0, normal: 1, low: 2 };

  return [...notifications].sort((a, b) => {
    // Sort by priority first
    const aPriority = priorityOrder[a.priority || "normal"];
    const bPriority = priorityOrder[b.priority || "normal"];

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then by date (newest first)
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });
};
