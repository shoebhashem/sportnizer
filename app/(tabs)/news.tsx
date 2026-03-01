// News Tab - Display all news items for the user
// Simple chronological list with read status

import NewsCard from "@/components/NewsCard";
import PaymentCard from "@/components/PaymentCard";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useNews } from "@/contexts/NewsContext";
import { useUser } from "@/contexts/UserContext";
import { fetchDependentProfiles } from "@/services/fetchDependentProfiles";
import { hasUserReadNews, News } from "@/services/news";
import { paymentService, PendingPayment } from "@/services/paymentService";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type ReadFilter = "all" | "unread";

interface ExpandedNewsData extends News {
  inviteeUserId: string;
  inviteeName: string;
  isCurrentUser: boolean;
}

export default function NewsTab() {
  const { t } = useTranslation(["screens", "common"]);
  const router = useRouter();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const {
    news: contextNews,
    refreshNews,
    isLoading: newsLoading,
    markAsRead,
  } = useNews();

  const [expandedNews, setExpandedNews] = useState<ExpandedNewsData[]>([]);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);

  // Fetch pending payments
  const fetchPendingPayments = useCallback(async () => {
    try {
      const result = await paymentService.getPendingPayments();
      if (result.success && result.payments) {
        // Filter to only show pending (not paid) payments
        const pending = result.payments.filter((p) => p.status !== "paid");
        setPendingPayments(pending);
      }
    } catch (error) {
      console.error("Error fetching pending payments:", error);
    }
  }, []);

  // Refresh payments when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchPendingPayments();
    }, [fetchPendingPayments]),
  );

  // Expand news for dependents (similar to events)
  useEffect(() => {
    const processNews = async () => {
      if (!user?.uid) {
        setExpandedNews([]);
        return;
      }

      try {
        // Fetch dependents to know which children to show
        const dependentProfiles = userProfile?.dependents
          ? await fetchDependentProfiles(userProfile.dependents)
          : [];
        const dependentIds = dependentProfiles.map((d) => d.uid);

        // Expand news: create separate card for each relevant recipient
        const expanded: ExpandedNewsData[] = [];

        for (const newsItem of contextNews) {
          // Check if current user is a recipient
          if (newsItem.recipientUserIds.includes(user.uid)) {
            expanded.push({
              ...newsItem,
              inviteeUserId: user.uid,
              inviteeName: "You",
              isCurrentUser: true,
            });
          }

          // Check if any dependents are recipients
          for (const dependentId of dependentIds) {
            if (newsItem.recipientUserIds.includes(dependentId)) {
              const dependent = dependentProfiles.find(
                (d) => d.uid === dependentId,
              );
              expanded.push({
                ...newsItem,
                inviteeUserId: dependentId,
                inviteeName: dependent?.displayName || "Child",
                isCurrentUser: false,
              });
            }
          }
        }

        setExpandedNews(expanded);
      } catch (error) {
        console.error("Error processing news:", error);
      }
    };

    processNews();
  }, [contextNews, user, userProfile]);

  // Filter news by read status
  const filteredNews = useMemo(() => {
    if (!user?.uid) return [];

    if (readFilter === "unread") {
      return expandedNews.filter(
        (item) => !hasUserReadNews(item, item.inviteeUserId),
      );
    }
    return expandedNews;
  }, [expandedNews, readFilter, user]);

  // Handle pull-to-refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshNews(), fetchPendingPayments()]);
    setRefreshing(false);
  };

  // Render payment cards header
  const renderListHeader = () => {
    if (pendingPayments.length === 0) return null;

    return (
      <View style={styles.paymentsSection}>
        <View style={styles.paymentsSectionHeader}>
          <Ionicons
            name="card-outline"
            size={20}
            color={theme.colors.secondary}
          />
          <Text style={styles.paymentsSectionTitle}>
            {t("screens:news.pendingPayments", { count: pendingPayments.length })}
          </Text>
        </View>
        {pendingPayments.map((payment) => (
          <PaymentCard
            key={`${payment.feeId}-${payment.beneficiaryId}`}
            payment={payment}
            onPaymentComplete={fetchPendingPayments}
          />
        ))}
      </View>
    );
  };

  // Handle news card press
  const handleNewsPress = (newsItem: ExpandedNewsData) => {
    // Mark as read if it's the current user's news
    if (newsItem.isCurrentUser && !hasUserReadNews(newsItem, user?.uid || "")) {
      markAsRead(newsItem.targetScope.clubId, newsItem.id);
    }

    router.push({
      pathname: "/news-details" as any,
      params: {
        newsId: newsItem.id,
        clubId: newsItem.targetScope.clubId,
      },
    });
  };

  // Count unread
  const unreadCount = useMemo(() => {
    if (!user?.uid) return 0;
    return expandedNews.filter(
      (item) => item.isCurrentUser && !hasUserReadNews(item, user.uid),
    ).length;
  }, [expandedNews, user]);

  // Render news item
  const renderNewsItem = ({ item }: { item: ExpandedNewsData }) => (
    <NewsCard
      news={item}
      onPress={() => handleNewsPress(item)}
      currentUserId={item.inviteeUserId}
      inviteeName={item.isCurrentUser ? undefined : item.inviteeName}
      isCurrentUser={item.isCurrentUser}
    />
  );

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="newspaper-outline"
        size={64}
        color={theme.colors.textSecondary}
      />
      <Text style={styles.emptyTitle}>
        {readFilter === "unread" ? t("screens:news.allCaughtUp") : t("screens:news.noNews")}
      </Text>
      <Text style={styles.emptySubtitle}>
        {readFilter === "unread"
          ? t("screens:news.readAllNews")
          : t("screens:news.newsFromClubs")}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        <View style={styles.filterGroup}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              readFilter === "all" && styles.filterButtonActive,
            ]}
            onPress={() => setReadFilter("all")}
          >
            <Text
              style={[
                styles.filterText,
                readFilter === "all" && styles.filterTextActive,
              ]}
            >
              {t("screens:news.allNews")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              readFilter === "unread" && styles.filterButtonActive,
            ]}
            onPress={() => setReadFilter("unread")}
          >
            <Text
              style={[
                styles.filterText,
                readFilter === "unread" && styles.filterTextActive,
              ]}
            >
              {t("screens:news.unread")}
            </Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading State */}
      {newsLoading && expandedNews.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>{t("screens:news.loadingNews")}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNews}
          renderItem={renderNewsItem}
          keyExtractor={(item, index) =>
            `${item.id}-${item.inviteeUserId}-${index}`
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.secondary}
              colors={[theme.colors.secondary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  filterGroup: {
    flexDirection: "row",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 4,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  filterButtonActive: {
    backgroundColor: theme.colors.secondary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  filterTextActive: {
    color: "#fff",
  },
  badge: {
    backgroundColor: theme.colors.badge.child,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  listContent: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.text,
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  paymentsSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  paymentsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  paymentsSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
});
