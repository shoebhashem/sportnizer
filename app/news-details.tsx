/**
 * News Details Screen
 *
 * Displays full news content with:
 * - Title and description
 * - Organization breadcrumb
 * - Creator and timestamp
 * - Edit button (for authorized users)
 * - Mark as read on view
 */

import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserContext";
import {
    deleteNews,
    fetchNewsItem,
    hasUserReadNews,
    markNewsAsRead,
    News,
} from "@/services/news";
import { canManageGroup, isClubAdmin } from "@/utils/permissionHelpers";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NewsDetailsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const params = useLocalSearchParams();

  const newsId = params.newsId as string;
  const clubId = params.clubId as string;

  console.log("🔍 DEBUG [news-details.tsx] - Route Params:", {
    newsId,
    clubId,
    allParams: params,
  });

  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });

  useEffect(() => {
    loadNewsDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId, clubId]);

  // Mark as read when viewing
  useEffect(() => {
    if (news && user && !hasUserReadNews(news, user.uid)) {
      markNewsAsRead(clubId, newsId, user.uid).catch((err) =>
        console.error("Failed to mark as read:", err),
      );
    }
  }, [news, user, clubId, newsId]);

  // Check if user can edit this news
  const canEdit = () => {
    if (!news || !userProfile || !user) return false;
    if (news.createdBy === user.uid) return true;
    if (news.targetScope.groupId) {
      return canManageGroup(
        userProfile,
        news.targetScope.clubId,
        news.targetScope.groupId,
      );
    }
    return isClubAdmin(userProfile, news.targetScope.clubId);
  };

  // Set dynamic header with edit button
  useLayoutEffect(() => {
    if (!news || !userProfile) {
      navigation.setOptions({
        headerRight: () => null,
      });
      return;
    }

    const showEdit = canEdit();

    navigation.setOptions({
      headerRight: () =>
        showEdit ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={handleShare}
              style={{ marginRight: 8, padding: 8 }}
            >
              <Ionicons
                name="share-outline"
                size={24}
                color={theme.colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!news) return;
                router.push({
                  pathname: "/create-news",
                  params: {
                    newsId: news.id,
                    clubId: news.targetScope.clubId,
                    clubName: news.targetScope.clubName,
                    groupId: news.targetScope.groupId || undefined,
                    groupName: news.targetScope.groupName || undefined,
                    subgroupId: news.targetScope.subgroupId || undefined,
                    subgroupName: news.targetScope.subgroupName || undefined,
                    mode: "edit",
                  },
                } as any);
              }}
              style={{ marginRight: 8, padding: 8 }}
            >
              <Ionicons
                name="create-outline"
                size={24}
                color={theme.colors.white}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleShare}
            style={{ marginRight: 8, padding: 8 }}
          >
            <Ionicons
              name="share-outline"
              size={24}
              color={theme.colors.white}
            />
          </TouchableOpacity>
        ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news, userProfile, navigation]);

  const loadNewsDetails = async () => {
    if (!newsId || !clubId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const newsData = await fetchNewsItem(clubId, newsId);
      setNews(newsData);
    } catch (error) {
      console.error("Error loading news:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!news) return;

    try {
      await Share.share({
        title: news.title,
        message: `${news.title}\n\n${news.description}\n\n- ${news.createdByName}`,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleDelete = async () => {
    if (!news) return;

    try {
      await deleteNews(clubId, newsId);
      router.back();
    } catch (error) {
      console.error("Error deleting news:", error);
      setErrorModal({
        visible: true,
        message: t("screens:newsDetails.failedToDeleteNews"),
      });
    }
  };

  // Format date
  const formatDate = (dateInput: any) => {
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

    return format(date, "EEEE, MMMM d, yyyy 'at' h:mm a");
  };

  // Get organization breadcrumb
  const getOrgBreadcrumb = () => {
    if (!news) return "";
    const parts: string[] = [];
    if (news.targetScope.clubName) parts.push(news.targetScope.clubName);
    if (news.targetScope.groupName) parts.push(news.targetScope.groupName);
    if (news.targetScope.subgroupName)
      parts.push(news.targetScope.subgroupName);
    return parts.join(" › ");
  };

  // Loading state
  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={theme.colors.secondary} />
        <Text style={styles.loadingText}>
          {t("screens:newsDetails.loadingNews")}
        </Text>
      </View>
    );
  }

  // Not found state
  if (!news) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <StatusBar style="light" />
        <Ionicons
          name="newspaper-outline"
          size={64}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.notFoundText}>
          {t("screens:newsDetails.newsNotFound")}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{t("common:goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top > 0 ? insets.top : 16 },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {t("screens:newsDetails.headerTitle")}
        </Text>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons
              name="share-outline"
              size={24}
              color={theme.colors.white}
            />
          </TouchableOpacity>

          {canEdit() && (
            <>
              <TouchableOpacity
                onPress={() => {
                  router.push({
                    pathname: "/create-news",
                    params: {
                      newsId: news.id,
                      clubId: news.targetScope.clubId,
                      clubName: news.targetScope.clubName,
                      groupId: news.targetScope.groupId || undefined,
                      groupName: news.targetScope.groupName || undefined,
                      subgroupId: news.targetScope.subgroupId || undefined,
                      subgroupName: news.targetScope.subgroupName || undefined,
                      mode: "edit",
                    },
                  } as any);
                }}
                style={styles.headerButton}
              >
                <Ionicons
                  name="create-outline"
                  size={24}
                  color={theme.colors.white}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(true)}
                style={styles.headerButton}
              >
                <Ionicons name="trash-outline" size={24} color="#F44336" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Organization Breadcrumb */}
        <View style={styles.breadcrumbRow}>
          <Ionicons
            name="business-outline"
            size={16}
            color={theme.colors.secondary}
          />
          <Text style={styles.breadcrumbText}>{getOrgBreadcrumb()}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{news.title}</Text>

        {/* Meta info */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons
              name="person-outline"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.metaText}>{news.createdByName}</Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons
              name="time-outline"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.metaText}>{formatDate(news.createdAt)}</Text>
          </View>
        </View>

        {/* Email indicator */}
        {news.emailDelivery?.enabled && (
          <View style={styles.emailBadge}>
            <Ionicons name="mail" size={14} color={theme.colors.secondary} />
            <Text style={styles.emailBadgeText}>
              {t("screens:newsDetails.sentViaEmail", {
                count: news.emailDelivery.sentCount || 0,
              })}
            </Text>
          </View>
        )}

        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>{news.description}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons
              name="people-outline"
              size={18}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.statText}>
              {t("screens:newsDetails.recipientCount", {
                count: news.recipientUserIds?.length || 0,
              })}
            </Text>
          </View>

          {news.readCount !== undefined && (
            <View style={styles.statItem}>
              <Ionicons
                name="eye-outline"
                size={18}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.statText}>
                {t("screens:newsDetails.readCount", { count: news.readCount })}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t("screens:newsDetails.deleteNews")}
        message={t("screens:newsDetails.deleteNewsConfirm")}
        confirmText={t("common:delete")}
        cancelText={t("common:cancel")}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Error Modal */}
      <ConfirmationModal
        visible={errorModal.visible}
        title={t("common:error")}
        message={errorModal.message}
        confirmText={t("common:ok")}
        onConfirm={() => setErrorModal({ visible: false, message: "" })}
        onCancel={() => setErrorModal({ visible: false, message: "" })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.text,
    fontSize: 16,
  },
  notFoundText: {
    marginTop: 16,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "600",
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.secondary,
    borderRadius: 8,
  },
  backButtonText: {
    color: theme.colors.white,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: theme.colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.white,
    textAlign: "center",
    marginHorizontal: 16,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  breadcrumbRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  breadcrumbText: {
    fontSize: 14,
    color: theme.colors.secondary,
    marginLeft: 8,
    fontWeight: "500",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: 16,
    lineHeight: 32,
  },
  metaRow: {
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  metaText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 8,
  },
  emailBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: "flex-start",
  },
  emailBadgeText: {
    fontSize: 13,
    color: theme.colors.secondary,
    marginLeft: 6,
  },
  descriptionContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 26,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 24,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  statText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
});
