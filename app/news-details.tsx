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
import LinkedText from "@/components/LinkedText";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserContext";
import {
    addNewsComment,
    attachNewsCommentsListener,
    attachNewsItemListener,
    attachUserNewsReactionListener,
    deleteNews,
    deleteNewsComment,
    fetchNewsReactions,
    hasUserReadNews,
    markNewsAsRead,
    News,
    REACTION_EMOJIS,
    ReactionEmoji,
    toggleCommentReaction,
    toggleNewsReaction,
    type NewsCommentClient,
    type NewsReactionEntry,
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
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
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
  const [comments, setComments] = useState<NewsCommentClient[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showDeleteCommentConfirm, setShowDeleteCommentConfirm] = useState<
    string | null
  >(null);
  const [showReadByModal, setShowReadByModal] = useState(false);
  // News-level reaction state
  const [myNewsReaction, setMyNewsReaction] = useState<ReactionEmoji | null>(
    null,
  );
  const [togglingNewsReaction, setTogglingNewsReaction] = useState(false);
  // Comment-level reaction state — tracks in-flight calls per commentId
  const [togglingCommentReaction, setTogglingCommentReaction] = useState<
    Record<string, boolean>
  >({});
  // Picker visibility state (null / false = closed)
  const [showNewsReactionPicker, setShowNewsReactionPicker] = useState(false);
  const [showCommentReactionPicker, setShowCommentReactionPicker] = useState<
    string | null
  >(null);
  // Reaction detail modal (WhatsApp-style: who reacted + emoji summary)
  const [reactionDetailTarget, setReactionDetailTarget] = useState<{
    type: "news" | "comment";
    commentId?: string;
  } | null>(null);
  const [reactionDetailFilter, setReactionDetailFilter] = useState<
    ReactionEmoji | "all"
  >("all");
  const [reactionDetailEntries, setReactionDetailEntries] = useState<
    NewsReactionEntry[]
  >([]);
  const [loadingReactionDetail, setLoadingReactionDetail] = useState(false);
  // Guard against double-write: userProfile loads asynchronously, causing this
  // effect to fire twice (once with userProfile=null, once after it resolves).
  // Without the guard, two different readBy objects get written (one with
  // userName, one without), showing "Unknown user" in the Reads modal.
  const hasMarkedAsRead = React.useRef(false);

  // Real-time listener for the news item (so reactionCounts update immediately)
  useEffect(() => {
    if (!newsId || !clubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = attachNewsItemListener(
      clubId,
      newsId,
      (newsData) => {
        setNews(newsData);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [newsId, clubId]);

  // Mark as read when viewing
  useEffect(() => {
    if (
      news &&
      user &&
      !hasMarkedAsRead.current &&
      !hasUserReadNews(news, user.uid)
    ) {
      hasMarkedAsRead.current = true;
      markNewsAsRead(clubId, newsId, user.uid, userProfile?.displayName).catch(
        (err) => console.error("Failed to mark as read:", err),
      );
    }
  }, [news, user, clubId, newsId, userProfile]);

  // Listen to comments
  useEffect(() => {
    if (!clubId || !newsId) return;
    const unsubscribe = attachNewsCommentsListener(
      clubId,
      newsId,
      (updatedComments) => setComments(updatedComments),
      (error) => console.error("Comments listener error:", error),
    );
    return unsubscribe;
  }, [clubId, newsId]);

  // Listen to current user's own news reaction
  useEffect(() => {
    if (!clubId || !newsId || !user) return;
    const unsubscribe = attachUserNewsReactionListener(
      clubId,
      newsId,
      user.uid,
      (emoji) => setMyNewsReaction(emoji),
      (error) => console.error("News reaction listener error:", error),
    );
    return unsubscribe;
  }, [clubId, newsId, user]);

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

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text || submittingComment) return;

    setSubmittingComment(true);
    try {
      const result = await addNewsComment(newsId, clubId, text);
      if (result.success) {
        setCommentText("");
      } else {
        setErrorModal({
          visible: true,
          message: result.error || t("screens:newsDetails.failedToAddComment"),
        });
      }
    } catch (error) {
      console.error("Error adding comment:", error);
      setErrorModal({
        visible: true,
        message: t("screens:newsDetails.failedToAddComment"),
      });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const result = await deleteNewsComment(newsId, clubId, commentId);
      if (!result.success) {
        setErrorModal({
          visible: true,
          message:
            result.error || t("screens:newsDetails.failedToDeleteComment"),
        });
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      setErrorModal({
        visible: true,
        message: t("screens:newsDetails.failedToDeleteComment"),
      });
    }
    setShowDeleteCommentConfirm(null);
  };

  const handleToggleNewsReaction = async (emoji: ReactionEmoji) => {
    if (togglingNewsReaction) return;
    setTogglingNewsReaction(true);
    try {
      await toggleNewsReaction(newsId, clubId, emoji);
    } catch (error) {
      console.error("Error toggling news reaction:", error);
    } finally {
      setTogglingNewsReaction(false);
    }
  };

  const handleToggleCommentReaction = async (
    commentId: string,
    emoji: ReactionEmoji,
  ) => {
    if (togglingCommentReaction[commentId]) return;
    setTogglingCommentReaction((prev) => ({ ...prev, [commentId]: true }));
    try {
      await toggleCommentReaction(newsId, clubId, commentId, emoji);
    } catch (error) {
      console.error("Error toggling comment reaction:", error);
    } finally {
      setTogglingCommentReaction((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  // Load reaction entries when detail modal opens
  useEffect(() => {
    if (!reactionDetailTarget) {
      setReactionDetailEntries([]);
      return;
    }
    if (reactionDetailTarget.type === "news") {
      setLoadingReactionDetail(true);
      fetchNewsReactions(clubId, newsId)
        .then(setReactionDetailEntries)
        .catch((err) => console.error("Error fetching reactions:", err))
        .finally(() => setLoadingReactionDetail(false));
    } else if (reactionDetailTarget.commentId) {
      const comment = comments.find(
        (c) => c.commentId === reactionDetailTarget.commentId,
      );
      setReactionDetailEntries(
        comment?.reactions
          ? Object.entries(comment.reactions).map(([uid, emoji]) => ({
              userId: uid,
              displayName: comment.reactorNames?.[uid] || "Member",
              emoji: emoji as ReactionEmoji,
            }))
          : [],
      );
    }
  }, [reactionDetailTarget, clubId, newsId, comments]);

  const openReactionDetail = (type: "news" | "comment", commentId?: string) => {
    setReactionDetailTarget({ type, commentId });
    setReactionDetailFilter("all");
  };

  const handleRemoveMyReaction = async () => {
    if (!reactionDetailTarget || !user) return;
    if (reactionDetailTarget.type === "news" && myNewsReaction) {
      await handleToggleNewsReaction(myNewsReaction);
    } else if (
      reactionDetailTarget.type === "comment" &&
      reactionDetailTarget.commentId
    ) {
      const comment = comments.find(
        (c) => c.commentId === reactionDetailTarget.commentId,
      );
      const myEmoji = comment?.reactions?.[user.uid];
      if (myEmoji) {
        await handleToggleCommentReaction(
          reactionDetailTarget.commentId,
          myEmoji as ReactionEmoji,
        );
      }
    }
    setReactionDetailTarget(null);
  };

  const canDeleteComment = (comment: NewsCommentClient) => {
    if (!user || !userProfile) return false;
    if (comment.createdBy === user.uid) return true;
    if (news?.createdBy === user.uid) return true;
    if (isClubAdmin(userProfile, clubId)) return true;
    if (news?.targetScope.groupId) {
      return canManageGroup(userProfile, clubId, news.targetScope.groupId);
    }
    return false;
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
      >
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
                        subgroupName:
                          news.targetScope.subgroupName || undefined,
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
          keyboardShouldPersistTaps="handled"
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

          {/* Description — long-press (native) or tap smiley (web) to react */}
          <Pressable
            style={styles.descriptionContainer}
            onLongPress={() => {
              if (Platform.OS !== "web") setShowNewsReactionPicker(true);
            }}
            delayLongPress={400}
          >
            <LinkedText style={styles.description}>
              {news.description}
            </LinkedText>
            {Platform.OS === "web" && (
              <TouchableOpacity
                style={styles.reactionHintButton}
                onPress={() => setShowNewsReactionPicker(true)}
              >
                <Text style={styles.reactionHintEmoji}>😊</Text>
              </TouchableOpacity>
            )}
          </Pressable>

          {/* Reaction summary pills (visible only when reactions exist) */}
          {news.reactionCounts &&
            Object.entries(news.reactionCounts).some(([, c]) => c > 0) && (
              <View style={styles.reactionSummaryRow}>
                {Object.entries(news.reactionCounts)
                  .filter(([, count]) => count > 0)
                  .map(([emoji, count]) => {
                    const isSelected = myNewsReaction === emoji;
                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[
                          styles.reactionSummaryPill,
                          isSelected && styles.reactionSummaryPillSelected,
                        ]}
                        onPress={() => openReactionDetail("news", undefined)}
                      >
                        <Text style={styles.reactionSummaryEmoji}>{emoji}</Text>
                        <Text
                          style={[
                            styles.reactionSummaryCount,
                            isSelected && styles.reactionSummaryCountSelected,
                          ]}
                        >
                          {count}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}

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
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => setShowReadByModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="eye-outline"
                  size={18}
                  color={theme.colors.secondary}
                />
                <Text
                  style={[styles.statText, { color: theme.colors.secondary }]}
                >
                  {t("screens:newsDetails.readCount", {
                    count: news.readCount,
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <View style={styles.commentsSectionHeader}>
              <Ionicons
                name="chatbubble-outline"
                size={18}
                color={theme.colors.text}
              />
              <Text style={styles.commentsSectionTitle}>
                {t("screens:newsDetails.comments")} ({comments.length})
              </Text>
            </View>

            {comments.length === 0 ? (
              <Text style={styles.noCommentsText}>
                {t("screens:newsDetails.noComments")}
              </Text>
            ) : (
              comments.map((comment) => (
                <View key={comment.commentId} style={styles.commentWrapper}>
                  <Pressable
                    style={styles.commentItem}
                    onLongPress={() => {
                      if (Platform.OS !== "web")
                        setShowCommentReactionPicker(comment.commentId);
                    }}
                    delayLongPress={400}
                  >
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>
                        {comment.createdByName}
                      </Text>
                      <View style={styles.commentHeaderRight}>
                        <Text style={styles.commentTime}>
                          {formatDate(comment.createdAt)}
                        </Text>
                        {canDeleteComment(comment) && (
                          <TouchableOpacity
                            onPress={() =>
                              setShowDeleteCommentConfirm(comment.commentId)
                            }
                            style={styles.deleteCommentButton}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color="#F44336"
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <LinkedText style={styles.commentText}>
                      {comment.text}
                    </LinkedText>
                    {/* Web: faded smiley to open emoji picker */}
                    {Platform.OS === "web" && (
                      <TouchableOpacity
                        style={styles.reactionHintButton}
                        onPress={() =>
                          setShowCommentReactionPicker(comment.commentId)
                        }
                      >
                        <Text style={styles.reactionHintEmoji}>😊</Text>
                      </TouchableOpacity>
                    )}
                  </Pressable>
                  {/* Comment reaction summary pills — below the bubble */}
                  {comment.reactionCounts &&
                    Object.entries(comment.reactionCounts).some(
                      ([, c]) => c > 0,
                    ) && (
                      <View style={styles.commentReactionPillsRow}>
                        {Object.entries(comment.reactionCounts)
                          .filter(([, count]) => count > 0)
                          .map(([emoji, count]) => {
                            const isSelected =
                              user && comment.reactions?.[user.uid] === emoji;
                            return (
                              <TouchableOpacity
                                key={emoji}
                                style={[
                                  styles.reactionSummaryPill,
                                  isSelected &&
                                    styles.reactionSummaryPillSelected,
                                ]}
                                onPress={() =>
                                  openReactionDetail(
                                    "comment",
                                    comment.commentId,
                                  )
                                }
                              >
                                <Text style={styles.reactionSummaryEmoji}>
                                  {emoji}
                                </Text>
                                <Text
                                  style={[
                                    styles.reactionSummaryCount,
                                    isSelected &&
                                      styles.reactionSummaryCountSelected,
                                  ]}
                                >
                                  {count}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                      </View>
                    )}
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Comment Input */}
        <View style={styles.commentInputContainer}>
          <TextInput
            style={styles.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder={t("screens:newsDetails.commentPlaceholder")}
            placeholderTextColor={theme.colors.textSecondary}
            maxLength={500}
            multiline
          />
          <TouchableOpacity
            onPress={handleAddComment}
            disabled={!commentText.trim() || submittingComment}
            style={[
              styles.sendButton,
              (!commentText.trim() || submittingComment) &&
                styles.sendButtonDisabled,
            ]}
          >
            {submittingComment ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Ionicons name="send" size={20} color={theme.colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Delete News Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t("screens:newsDetails.deleteNews")}
        message={t("screens:newsDetails.deleteNewsConfirm")}
        confirmText={t("common:delete")}
        cancelText={t("common:cancel")}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Delete Comment Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteCommentConfirm !== null}
        title={t("screens:newsDetails.deleteComment")}
        message={t("screens:newsDetails.deleteCommentConfirm")}
        confirmText={t("common:delete")}
        cancelText={t("common:cancel")}
        onConfirm={() =>
          showDeleteCommentConfirm &&
          handleDeleteComment(showDeleteCommentConfirm)
        }
        onCancel={() => setShowDeleteCommentConfirm(null)}
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

      {/* Read By Modal */}
      <Modal
        visible={showReadByModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReadByModal(false)}
      >
        <View style={styles.readByModalOverlay}>
          <View style={styles.readByModalContainer}>
            <View style={styles.readByModalHeader}>
              <Text style={styles.readByModalTitle}>
                {t("screens:newsDetails.readBy")} ({news?.readBy?.length || 0})
              </Text>
              <TouchableOpacity onPress={() => setShowReadByModal(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[...(news?.readBy || [])].sort((a, b) => {
                const timeA = a.readAt?.toMillis?.() || 0;
                const timeB = b.readAt?.toMillis?.() || 0;
                return timeB - timeA;
              })}
              keyExtractor={(item) => item.userId}
              style={styles.readByList}
              renderItem={({ item }) => (
                <View style={styles.readByItem}>
                  <Ionicons
                    name="person-circle-outline"
                    size={32}
                    color={theme.colors.textSecondary}
                  />
                  <View style={styles.readByItemInfo}>
                    <Text style={styles.readByItemName}>
                      {item.userName || t("screens:newsDetails.unknownMember")}
                    </Text>
                    <Text style={styles.readByItemTime}>
                      {item.readAt?.toDate
                        ? format(item.readAt.toDate(), "d MMM yyyy, HH:mm")
                        : ""}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.readByEmpty}>
                  {t("screens:newsDetails.noReaders")}
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Emoji Reaction Picker — WhatsApp-style floating emoji bar */}
      <Modal
        visible={showNewsReactionPicker || showCommentReactionPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowNewsReactionPicker(false);
          setShowCommentReactionPicker(null);
        }}
      >
        <TouchableOpacity
          style={styles.reactionPickerOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowNewsReactionPicker(false);
            setShowCommentReactionPicker(null);
          }}
        >
          <View style={styles.reactionPickerContainer}>
            {REACTION_EMOJIS.map((emoji) => {
              const isSelected = showNewsReactionPicker
                ? myNewsReaction === emoji
                : showCommentReactionPicker
                  ? comments.find(
                      (c) => c.commentId === showCommentReactionPicker,
                    )?.reactions?.[user?.uid ?? ""] === emoji
                  : false;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.reactionPickerEmojiBtn,
                    isSelected && styles.reactionPickerEmojiBtnSelected,
                  ]}
                  onPress={() => {
                    if (showNewsReactionPicker) {
                      handleToggleNewsReaction(emoji);
                      setShowNewsReactionPicker(false);
                    } else if (showCommentReactionPicker) {
                      handleToggleCommentReaction(
                        showCommentReactionPicker,
                        emoji,
                      );
                      setShowCommentReactionPicker(null);
                    }
                  }}
                >
                  <Text style={styles.reactionPickerEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Reaction Detail Modal — WhatsApp who-reacted panel */}
      <Modal
        visible={reactionDetailTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setReactionDetailTarget(null);
          setReactionDetailFilter("all");
        }}
      >
        <View style={styles.reactionDetailOverlay}>
          <View style={styles.reactionDetailContainer}>
            {/* Header */}
            <View style={styles.reactionDetailHeader}>
              <Text style={styles.reactionDetailTitle}>
                {t("screens:newsDetails.reactions")}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setReactionDetailTarget(null);
                  setReactionDetailFilter("all");
                }}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {/* Emoji filter tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.reactionTabBar}
              contentContainerStyle={styles.reactionTabBarContent}
            >
              {REACTION_EMOJIS.map((emoji) => {
                const count = reactionDetailEntries.filter(
                  (e) => e.emoji === emoji,
                ).length;
                if (count === 0) return null;
                const isActive = reactionDetailFilter === emoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.reactionTab,
                      isActive && styles.reactionTabActive,
                    ]}
                    onPress={() =>
                      setReactionDetailFilter(isActive ? "all" : emoji)
                    }
                  >
                    <Text style={styles.reactionTabEmoji}>{emoji}</Text>
                    <Text
                      style={[
                        styles.reactionTabText,
                        isActive && styles.reactionTabTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Reactor list */}
            {loadingReactionDetail ? (
              <ActivityIndicator
                style={{ marginTop: 24 }}
                color={theme.colors.secondary}
              />
            ) : (
              <FlatList
                data={
                  reactionDetailFilter === "all"
                    ? reactionDetailEntries
                    : reactionDetailEntries.filter(
                        (e) => e.emoji === reactionDetailFilter,
                      )
                }
                keyExtractor={(item) => item.userId}
                style={styles.reactorList}
                renderItem={({ item }) => {
                  const isMe = item.userId === user?.uid;
                  return (
                    <TouchableOpacity
                      style={styles.reactorRow}
                      disabled={!isMe}
                      onPress={() => {
                        if (!isMe) return;
                        handleRemoveMyReaction();
                      }}
                    >
                      <View
                        style={[
                          styles.reactorAvatar,
                          isMe && styles.reactorAvatarMe,
                        ]}
                      >
                        <Text style={styles.reactorAvatarText}>
                          {(isMe
                            ? userProfile?.displayName || "Y"
                            : item.displayName
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.reactorInfo}>
                        <Text
                          style={[
                            styles.reactorName,
                            isMe && styles.reactorNameMe,
                          ]}
                        >
                          {isMe
                            ? userProfile?.displayName ||
                              t("screens:newsDetails.unknownMember")
                            : item.displayName}
                        </Text>
                        {isMe && (
                          <Text style={styles.reactorTapHint}>
                            {t("screens:newsDetails.tapToRemove")}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.reactorEmoji}>{item.emoji}</Text>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.noReactorsText}>
                    {t("screens:newsDetails.noReactions")}
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
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
    marginBottom: 8,
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
  commentsSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    paddingTop: 20,
  },
  commentsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  commentsSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginLeft: 8,
  },
  noCommentsText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 16,
  },
  commentWrapper: {
    marginBottom: 10,
  },
  commentItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 10,
    padding: 14,
  },
  commentReactionPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  commentHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.secondary,
    flex: 1,
  },
  commentTime: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  deleteCommentButton: {
    marginLeft: 8,
    padding: 4,
  },
  commentText: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  // Reaction picker (WhatsApp-style floating emoji bar)
  reactionPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  reactionPickerContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  reactionPickerEmojiBtn: {
    padding: 8,
    borderRadius: 24,
  },
  reactionPickerEmojiBtnSelected: {
    backgroundColor: `${theme.colors.secondary}33`,
  },
  reactionPickerEmojiText: {
    fontSize: 30,
  },
  // Reaction summary pills (shown below content when reactions exist)
  reactionSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  reactionSummaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.inputBackground,
  },
  reactionSummaryPillSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: `${theme.colors.secondary}22`,
  },
  reactionSummaryEmoji: {
    fontSize: 14,
  },
  reactionSummaryCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  reactionSummaryCountSelected: {
    color: theme.colors.secondary,
  },
  // Web: faded smiley hint button
  reactionHintButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    padding: 2,
    opacity: 0.35,
  },
  reactionHintEmoji: {
    fontSize: 16,
  },
  commentInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.primary,
  },
  commentInput: {
    flex: 1,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: theme.colors.secondary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  // Reaction detail modal (WhatsApp who-reacted panel)
  reactionDetailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  reactionDetailContainer: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    paddingBottom: 20,
  },
  reactionDetailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  reactionDetailTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },
  reactionTabBar: {
    flexGrow: 0,
  },
  reactionTabBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  reactionTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.inputBackground,
  },
  reactionTabActive: {
    borderColor: theme.colors.secondary,
    backgroundColor: `${theme.colors.secondary}22`,
  },
  reactionTabEmoji: {
    fontSize: 16,
  },
  reactionTabText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  reactionTabTextActive: {
    color: theme.colors.secondary,
  },
  reactorList: {
    flexShrink: 1,
  },
  reactorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  reactorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${theme.colors.secondary}33`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  reactorAvatarMe: {
    backgroundColor: theme.colors.secondary,
  },
  reactorAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  reactorInfo: {
    flex: 1,
  },
  reactorName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  reactorNameMe: {
    color: theme.colors.secondary,
  },
  reactorTapHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  reactorEmoji: {
    fontSize: 22,
    marginLeft: 8,
  },
  noReactorsText: {
    textAlign: "center",
    color: theme.colors.textSecondary,
    fontSize: 14,
    padding: 24,
  },
  readByModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  readByModalContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "70%",
  },
  readByModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  readByModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },
  readByList: {
    padding: 8,
  },
  readByItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  readByItemInfo: {
    marginLeft: 12,
    flex: 1,
  },
  readByItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  readByItemTime: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  readByEmpty: {
    textAlign: "center",
    color: theme.colors.textSecondary,
    fontSize: 14,
    padding: 20,
  },
});
