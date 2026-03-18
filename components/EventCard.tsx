// EventCard Component - Display event information in a card format
// Used in Home and Events tabs with identical appearance

import { theme } from "@/constants/theme";
import type { EventData } from "@/services/types/event";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface EventCardProps {
  event: EventData;
  onPress: () => void;
  recipientName?: string; // For guardians: show child name
  currentUserId?: string; // Current user's ID for status detection
  inviteeUserId: string; // ID of the person this card represents
  inviteeName: string; // Name to show in badge
  isCurrentUser: boolean; // True if this is the current user's card
  isYouthMember?: boolean; // True if invitee is a youth member
  responseStatus?: string; // Pre-computed status (e.g. "organizer" for non-member creators)
}

export default function EventCard({
  event,
  onPress,
  recipientName,
  currentUserId,
  inviteeUserId,
  inviteeName,
  isCurrentUser,
  isYouthMember,
  responseStatus: responseStatusProp,
}: EventCardProps) {
  const { t } = useTranslation(["components", "common"]);

  // Format date and time
  const formatDate = (dateInput: string | Date) => {
    const date =
      typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return t("components:eventCard.today");
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return t("components:eventCard.tomorrow");
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  };

  const formatTime = (timeString: string | null | undefined | any) => {
    // Handle null, undefined, or non-string values
    if (!timeString || typeof timeString !== "string") return "";

    // Handle ISO string format (from Firestore)
    if (timeString.includes("T") || timeString.includes("Z")) {
      const date = new Date(timeString);
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${hours}:${minutes}`;
    }

    // Handle HH:mm format (legacy) - already in 24-hour format
    return timeString;
  };

  // Get event type icon and color (yellow for all types)
  const getEventTypeInfo = (eventType: string) => {
    switch (eventType) {
      case "training":
        return { icon: "fitness" as const, color: theme.colors.secondary };
      case "match":
        return { icon: "trophy" as const, color: theme.colors.secondary };
      case "meeting":
        return { icon: "people" as const, color: theme.colors.secondary };
      default:
        return { icon: "calendar" as const, color: theme.colors.secondary };
    }
  };

  // Get user's response status
  const getUserResponseStatus = () => {
    // Use pre-computed status if provided (e.g. "organizer" for non-member creators)
    if (responseStatusProp) return responseStatusProp;

    if (!event.responses || !inviteeUserId) return "pending";

    // Find response by invitee's ID (not necessarily current user)
    const response = event.responses.find((r) => r.userId === inviteeUserId);
    // Normalize status field (handle both 'status' and 'response' fields)
    const status = response?.status || response?.response || "pending";
    return status;
  };

  const responseStatus = getUserResponseStatus();
  const eventTypeInfo = getEventTypeInfo(event.eventType || "other");

  // Check if deadline is approaching (within 24 hours)
  const isDeadlineApproaching = () => {
    if (!event.responseDeadline) return false;
    const deadline = new Date(event.responseDeadline);
    const now = new Date();
    const hoursUntilDeadline =
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilDeadline > 0 && hoursUntilDeadline < 24;
  };

  // Check if event is cancelled
  const isEventCancelled = event.status === "cancelled";

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted":
        return "#4CAF50";
      case "declined":
        return "#F44336";
      case "cancelled":
        return "#B71C1C";
      case "organizer":
        return "#1976D2"; // Blue for organizer/creator
      default:
        return theme.colors.textSecondary;
    }
  };

  // Display status: if event is cancelled, override individual response status
  const displayStatus = isEventCancelled ? "cancelled" : responseStatus;

  return (
    <TouchableOpacity
      style={[styles.card, isEventCancelled && styles.cancelledCard]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Cancelled Banner */}
      {isEventCancelled && (
        <View style={styles.cancelledBanner}>
          <Ionicons name="close-circle" size={16} color="#fff" />
          <Text style={styles.cancelledBannerText}>
            {t("components:eventCard.cancelled")}
          </Text>
        </View>
      )}

      {/* Recurring Badge */}
      {event.isRecurring && !isEventCancelled && (
        <View style={styles.recurringBadge}>
          <Ionicons name="repeat" size={14} color={theme.colors.secondary} />
          <Text style={styles.recurringBadgeText}>
            {t("components:eventCard.recurring")}
          </Text>
        </View>
      )}

      {/* Header Row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name={eventTypeInfo.icon}
            size={24}
            color={
              isEventCancelled
                ? theme.colors.textSecondary
                : eventTypeInfo.color
            }
          />
          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>
        </View>

        {/* Invitee Badge */}
        <View
          style={[
            styles.inviteeBadge,
            {
              backgroundColor: isCurrentUser
                ? theme.colors.badge.you
                : theme.colors.badge.child,
            },
          ]}
        >
          <Text style={styles.inviteeText}>
            {isCurrentUser ? t("components:eventCard.you") : inviteeName}
          </Text>
        </View>
      </View>

      {/* Recipient Name (for guardians with multiple children) */}
      {recipientName && (
        <View style={styles.recipientRow}>
          <Ionicons
            name="person-circle-outline"
            size={16}
            color={theme.colors.secondary}
          />
          <Text style={styles.recipientText}>
            {t("components:eventCard.forRecipient", { name: recipientName })}
          </Text>
        </View>
      )}

      {/* Organization Info */}
      <View style={styles.orgRow}>
        <Ionicons
          name="business-outline"
          size={14}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.orgText} numberOfLines={1}>
          {event.clubName}
          {event.groupName && ` • ${event.groupName}`}
          {event.subGroupName && ` • ${event.subGroupName}`}
        </Text>
      </View>

      {/* Date and Time Row */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Ionicons
            name="calendar-outline"
            size={16}
            color={theme.colors.secondary}
          />
          <Text style={styles.infoText}>{formatDate(event.startDate)}</Text>
        </View>

        {/* Show gathering time if exists, otherwise show start time */}
        {event.gatheringTime && typeof event.gatheringTime === "string" ? (
          <View style={styles.infoItem}>
            <Ionicons
              name="people-outline"
              size={16}
              color={theme.colors.accent}
            />
            <Text style={[styles.infoText, { color: theme.colors.accent }]}>
              {t("components:eventCard.gatherTime", {
                time: formatTime(event.gatheringTime),
              })}
            </Text>
          </View>
        ) : (
          <View style={styles.infoItem}>
            <Ionicons
              name="time-outline"
              size={16}
              color={theme.colors.secondary}
            />
            <Text style={styles.infoText}>
              {formatTime(event.startTime || "")}
              {event.endTime &&
                formatTime(event.endTime) &&
                ` - ${formatTime(event.endTime)}`}
            </Text>
          </View>
        )}
      </View>

      {/* Start Time (show if gathering time exists) */}
      {event.gatheringTime &&
        typeof event.gatheringTime === "string" &&
        event.startTime && (
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons
                name="time-outline"
                size={16}
                color={theme.colors.secondary}
              />
              <Text style={styles.infoText}>
                {t("components:eventCard.startTime", {
                  time: formatTime(event.startTime),
                })}
                {event.endTime &&
                  formatTime(event.endTime) &&
                  ` - ${formatTime(event.endTime)}`}
              </Text>
            </View>
          </View>
        )}

      {/* Location */}
      {event.location && (
        <View style={styles.locationRow}>
          <Ionicons
            name="location-outline"
            size={16}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.locationText} numberOfLines={1}>
            {event.location}
          </Text>
        </View>
      )}

      {/* Response Status Badge */}
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(displayStatus) },
          ]}
        >
          <Text style={styles.statusText}>
            {isEventCancelled
              ? t("components:eventCard.cancelled")
              : displayStatus === "organizer"
                ? t("components:eventCard.organizer")
                : displayStatus.charAt(0).toUpperCase() +
                  displayStatus.slice(1)}
          </Text>
        </View>
      </View>

      {/* Response Summary */}
      {event.responseSummary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
            <Text style={styles.summaryText}>
              {event.responseSummary.accepted}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Ionicons name="close-circle" size={14} color="#F44336" />
            <Text style={styles.summaryText}>
              {event.responseSummary.declined}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Ionicons
              name="help-circle"
              size={14}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.summaryText}>
              {event.responseSummary.pending}
            </Text>
          </View>

          <Text style={styles.summaryTotal}>
            {t("components:eventCard.ofTotalInvited", {
              total: event.responseSummary.totalInvited,
            })}
          </Text>
        </View>
      )}

      {/* Deadline Warning */}
      {!isEventCancelled &&
        isDeadlineApproaching() &&
        responseStatus === "pending" && (
          <View style={styles.deadlineWarning}>
            <Ionicons name="warning-outline" size={14} color="#FF9800" />
            <Text style={styles.deadlineText}>
              {t("components:eventCard.deadlineApproaching")}
            </Text>
          </View>
        )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelledCard: {
    opacity: 0.85,
    borderWidth: 1,
    borderColor: "#B71C1C",
  },
  cancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#B71C1C",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
    gap: 6,
  },
  cancelledBannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76, 175, 80, 0.12)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: "flex-start",
    gap: 5,
  },
  recurringBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.secondary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1d21",
    marginLeft: 12,
    flex: 1,
  },
  inviteeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inviteeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.white,
  },
  statusRow: {
    marginTop: 8,
    alignItems: "flex-start",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.white,
    textTransform: "capitalize",
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  recipientText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.secondary,
    marginLeft: 6,
  },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  orgText: {
    fontSize: 13,
    color: "#666", // Darker text for better contrast
    marginLeft: 6,
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 20,
  },
  infoText: {
    fontSize: 14,
    color: "#1a1d21", // Dark text for white card background
    marginLeft: 6,
  },
  gatheringText: {
    color: theme.colors.accent,
    fontWeight: "500",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  locationText: {
    fontSize: 14,
    color: "#1a1d21", // Dark text for white card background
    marginLeft: 6,
    flex: 1,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1d21", // Dark text for white card background
    marginLeft: 4,
  },
  summaryTotal: {
    fontSize: 12,
    color: "#666", // Darker text for better contrast
    marginLeft: "auto",
  },
  deadlineWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  deadlineText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#F57C00",
    marginLeft: 6,
  },
});
