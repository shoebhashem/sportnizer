// NewsCard Component - Display news information in a card format
// Similar to EventCard but simpler - no responses/deadlines

import { theme } from "@/constants/theme";
import { News, hasUserReadNews } from "@/services/news";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface NewsCardProps {
  news: News;
  onPress: () => void;
  currentUserId: string;
  inviteeName?: string; // For guardians: show child name
  isCurrentUser?: boolean; // True if this is the current user's card
}

export default function NewsCard({
  news,
  onPress,
  currentUserId,
  inviteeName,
  isCurrentUser = true,
}: NewsCardProps) {
  const { t } = useTranslation(["components", "common"]);

  // Check if user has read this news
  const isRead = hasUserReadNews(news, currentUserId);

  // Format date
  const formatDate = (dateInput: any) => {
    // Handle Firestore Timestamp
    let date: Date;
    if (dateInput?.toDate) {
      date = dateInput.toDate();
    } else if (dateInput?.seconds) {
      date = new Date(dateInput.seconds * 1000);
    } else if (typeof dateInput === "string") {
      date = new Date(dateInput);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else {
      return "";
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t("components:newsCard.justNow");
    if (diffMins < 60) return t("components:newsCard.minutesAgo", { count: diffMins });
    if (diffHours < 24) return t("components:newsCard.hoursAgo", { count: diffHours });
    if (diffDays < 7) return t("components:newsCard.daysAgo", { count: diffDays });

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  // Get organization breadcrumb
  const getOrgBreadcrumb = () => {
    const parts: string[] = [];
    if (news.targetScope.clubName) parts.push(news.targetScope.clubName);
    if (news.targetScope.groupName) parts.push(news.targetScope.groupName);
    if (news.targetScope.subgroupName)
      parts.push(news.targetScope.subgroupName);
    return parts.join(" • ");
  };

  // Truncate description for preview
  const getDescriptionPreview = (text: string, maxLength: number = 120) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + "...";
  };

  return (
    <TouchableOpacity
      style={[styles.card, !isRead && styles.unreadCard]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header Row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name="newspaper-outline"
            size={24}
            color={theme.colors.badge.child} // Blue color for news
          />
          <Text style={styles.title} numberOfLines={2}>
            {news.title}
          </Text>
        </View>

        {/* Invitee Badge */}
        {inviteeName && (
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
              {isCurrentUser ? t("components:newsCard.you") : inviteeName}
            </Text>
          </View>
        )}
      </View>

      {/* Unread indicator */}
      {!isRead && (
        <View style={styles.unreadIndicator}>
          <View style={styles.unreadDot} />
          <Text style={styles.unreadText}>{t("components:newsCard.new")}</Text>
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
          {getOrgBreadcrumb()}
        </Text>
      </View>

      {/* Description Preview */}
      <Text style={styles.description} numberOfLines={3}>
        {getDescriptionPreview(news.description)}
      </Text>

      {/* Footer Row */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Ionicons
            name="person-outline"
            size={14}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.footerText}>{t("components:newsCard.issuedBy", { name: news.createdByName })}</Text>
        </View>

        <View style={styles.footerRight}>
          <Ionicons
            name="time-outline"
            size={14}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.footerText}>{formatDate(news.createdAt)}</Text>
        </View>
      </View>
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
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.badge.child, // Blue for unread
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1d21",
    marginLeft: 12,
    flex: 1,
    lineHeight: 22,
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
  unreadIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.badge.child,
    marginRight: 6,
  },
  unreadText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.badge.child,
  },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  orgText: {
    fontSize: 13,
    color: "#666",
    marginLeft: 6,
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    color: "#666",
    marginLeft: 4,
  },
  emailIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  emailText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
});
