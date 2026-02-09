import { theme } from "@/constants/theme";
import { getCurrentUser } from "@/services/auth/authService";
import {
    dismissNotification,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    subscribeToUserNotifications,
    type NotificationData,
} from "@/services/fetchNotifications";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

/**
 * 🔔 NotificationBell Component
 *
 * Real-time notification bell with badge counter and dropdown list.
 * Displays group invitations and other notifications with live updates.
 *
 * Features:
 * - Real-time Firestore listener for instant updates
 * - Unread badge counter
 * - Notification list modal/dropdown
 * - Mark as read/unread functionality
 * - Dismiss notifications
 * - Navigate to relevant screens based on notification type
 */

interface NotificationBellProps {
  onInvitationPress?: (invitationToken: string, metadata?: any) => void;
  iconSize?: number;
  iconColor?: string;
}

export default function NotificationBell({
  onInvitationPress,
  iconSize = 24,
  iconColor = theme.colors.white,
}: NotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUserId(user.uid);
    }
  }, []);

  // Subscribe to notifications
  useEffect(() => {
    if (!currentUserId) return;

    setLoading(true);

    const unsubscribe = subscribeToUserNotifications(
      currentUserId,
      (updatedNotifications) => {
        setNotifications(updatedNotifications);

        // Update unread count
        const unread = updatedNotifications.filter(
          (n) => !n.read && !n.dismissed,
        ).length;
        setUnreadCount(unread);

        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to notifications:", error);
        setLoading(false);
      },
    );

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [currentUserId]);

  // Handle notification press
  const handleNotificationPress = async (notification: NotificationData) => {
    if (!currentUserId) return;

    // Mark as read if not already
    if (!notification.read) {
      await markNotificationAsRead(currentUserId, notification.id);
    }

    // Handle different notification types
    switch (notification.type) {
      case "group_invitation":
      case "youth_member_invitation":
        if (onInvitationPress && notification.invitationToken) {
          onInvitationPress(
            notification.invitationToken,
            notification.metadata,
          );
          setModalVisible(false);
        }
        break;

      case "announcement":
        // Navigate to announcement details
        console.log("Navigate to announcement:", notification);
        setModalVisible(false);
        break;

      case "event":
        // Navigate to event details
        if (notification.sourceId && notification.clubId) {
          router.push({
            pathname: "/event-details" as any,
            params: {
              eventId: notification.sourceId,
              clubId: notification.clubId,
            },
          });
        }
        setModalVisible(false);
        break;

      default:
        console.log("Notification clicked:", notification);
        setModalVisible(false);
    }
  };

  // Handle dismiss
  const handleDismiss = async (notificationId: string, e: any) => {
    e.stopPropagation(); // Prevent triggering the notification press

    if (!currentUserId) return;

    await dismissNotification(currentUserId, notificationId);
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    if (!currentUserId) return;
    await markAllNotificationsAsRead(currentUserId);
  };

  // Get icon for notification type
  const getNotificationIcon = (
    type: string,
  ): keyof typeof FontAwesome.glyphMap => {
    switch (type) {
      case "group_invitation":
        return "user-plus";
      case "youth_member_invitation":
        return "child";
      case "announcement":
        return "bullhorn";
      case "event":
        return "calendar";
      case "poll":
        return "question-circle";
      case "role_changed":
        return "shield";
      case "member_joined":
        return "users";
      case "event_cancelled":
        return "calendar-times-o";
      default:
        return "bell";
    }
  };

  // Format timestamp - handles both Firestore Timestamp and Date objects
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return "Unknown time";

    // Convert Firestore Timestamp to JavaScript Date
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  };

  // Render notification item
  const renderNotification = ({ item }: { item: NotificationData }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unreadNotification]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationIcon}>
        <FontAwesome
          name={getNotificationIcon(item.type)}
          size={20}
          color={
            item.read ? theme.colors.textSecondary : theme.colors.secondary
          }
        />
      </View>

      <View style={styles.notificationContent}>
        <Text
          style={[styles.notificationTitle, !item.read && styles.unreadText]}
        >
          {item.title}
        </Text>
        <Text style={styles.notificationBody} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={styles.notificationTime}>
          {formatTimestamp(item.createdAt)}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.dismissButton}
        onPress={(e) => handleDismiss(item.id, e)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <FontAwesome
          name="times"
          size={16}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <>
      {/* Bell Icon with Badge */}
      <TouchableOpacity
        style={styles.bellContainer}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <FontAwesome name="bell" size={iconSize} color={iconColor} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Notifications Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <View style={styles.headerActions}>
                {unreadCount > 0 && (
                  <TouchableOpacity
                    onPress={handleMarkAllAsRead}
                    style={styles.markAllButton}
                  >
                    <Text style={styles.markAllText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <FontAwesome
                    name="times"
                    size={24}
                    color={theme.colors.white}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Notifications List */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  size="large"
                  color={theme.colors.secondary}
                />
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <FontAwesome
                  name="bell-slash-o"
                  size={48}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.emptyText}>No notifications</Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                renderItem={renderNotification}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={true}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellContainer: {
    position: "relative",
    padding: 8,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: theme.colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: theme.typography.fontWeight.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: theme.borderRadius.large,
    borderTopRightRadius: theme.borderRadius.large,
    maxHeight: "80%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  markAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    color: theme.colors.secondary,
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
  },
  loadingContainer: {
    padding: theme.spacing.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    padding: theme.spacing.xxl,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
  },
  listContainer: {
    paddingVertical: theme.spacing.sm,
  },
  notificationItem: {
    flexDirection: "row",
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.primary,
    position: "relative",
  },
  unreadNotification: {
    backgroundColor: "rgba(255, 211, 61, 0.05)",
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  notificationContent: {
    flex: 1,
    gap: 4,
  },
  notificationTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.white,
    fontWeight: theme.typography.fontWeight.medium,
  },
  unreadText: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  notificationBody: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  notificationTime: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  dismissButton: {
    padding: 8,
    marginLeft: 8,
  },
  unreadDot: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.secondary,
  },
});
