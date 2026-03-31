/**
 * Create News Screen
 *
 * A simplified form for creating or editing news items.
 * Similar to create-event but much simpler - no dates, times, responses, etc.
 *
 * Features:
 * - Title (max 100 chars)
 * - Description (max 4200 chars / ~700 words)
 * - Role targeting (optional)
 * - Email delivery toggle
 */

import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTrackFeatureOnAction } from "@/hooks/useOnboardingFeatureTracker";
import ConfirmationModal from "../components/ConfirmationModal";
import RoleFilterModal, { ClubRole } from "../components/RoleFilterModal";
import { theme } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useClubData } from "../contexts/ClubDataContext";
import { useGroupData } from "../contexts/GroupDataContext";
import { useUser } from "../contexts/UserContext";
import { newsCreationService } from "../services/news/createNews";
import {
    deleteNews,
    fetchNewsItem,
    updateNews,
} from "../services/news/newsListener";

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 4200;

interface NewsContext {
  level: "club" | "group" | "subgroup";
  clubId: string;
  clubName: string;
  groupId?: string;
  groupName?: string;
  subgroupId?: string;
  subgroupName?: string;
  sourceScreen?: string;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
}

export default function CreateNewsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const { getClubMembers } = useClubData();
  const { getGroupMembers, getSubgroupMembers } = useGroupData();
  const trackNewsCreated = useTrackFeatureOnAction("news-created");

  console.log("🔍 CreateNews - Received Params:", params);

  // Extract news context from params
  const newsContext: NewsContext | null = useMemo(() => {
    if (!params.clubId) return null;

    // Check for subgroup-level
    if (params.subgroupId && params.groupId) {
      return {
        level: "subgroup",
        clubId: params.clubId as string,
        clubName: params.clubName as string,
        groupId: params.groupId as string,
        groupName: params.groupName as string,
        subgroupId: params.subgroupId as string,
        subgroupName: params.subgroupName as string,
        sourceScreen: params.sourceScreen as string,
      };
    }

    // Check for group-level
    if (params.groupId) {
      return {
        level: "group",
        clubId: params.clubId as string,
        clubName: params.clubName as string,
        groupId: params.groupId as string,
        groupName: params.groupName as string,
        sourceScreen: params.sourceScreen as string,
      };
    }

    // Default to club-level
    return {
      level: "club",
      clubId: params.clubId as string,
      clubName: params.clubName as string,
      sourceScreen: params.sourceScreen as string,
    };
  }, [
    params.clubId,
    params.clubName,
    params.groupId,
    params.groupName,
    params.subgroupId,
    params.subgroupName,
    params.sourceScreen,
  ]);

  // Edit mode detection
  const isEditMode = !!params.newsId;
  const newsId = params.newsId as string | undefined;

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<ClubRole[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [showRoleFilterModal, setShowRoleFilterModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: "",
    message: "",
  });

  // Read selectedMemberIds from navigation params (returned from select-event-members screen)
  useEffect(() => {
    if (params.selectedMemberIds) {
      const ids =
        typeof params.selectedMemberIds === "string"
          ? params.selectedMemberIds.split(",").filter(Boolean)
          : [];
      setSelectedMemberIds(ids);
    }
  }, [params.selectedMemberIds]);

  // Load news data if in edit mode
  useEffect(() => {
    if (isEditMode && newsId && newsContext) {
      loadNewsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, newsId]);

  // Load member count when context changes or role filter changes
  useEffect(() => {
    if (newsContext) {
      loadMemberCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsContext, selectedRoles]);

  const loadNewsData = async () => {
    if (!newsId || !newsContext) return;

    setIsLoadingNews(true);
    try {
      const news = await fetchNewsItem(newsContext.clubId, newsId);

      if (!news) {
        setModal({
          visible: true,
          title: t("common:error"),
          message: t("screens:createNews.newsNotFound"),
        });
        router.back();
        return;
      }

      // Populate form
      setTitle(news.title);
      setDescription(news.description);
      setSelectedRoles((news.roleFilter as ClubRole[]) || []);
    } catch (error) {
      console.error("Error loading news:", error);
      setModal({
        visible: true,
        title: t("common:error"),
        message: t("screens:createNews.failedToLoadNews"),
      });
    } finally {
      setIsLoadingNews(false);
    }
  };

  const loadMemberCount = async () => {
    if (!newsContext) return;

    setIsLoadingMembers(true);
    try {
      let members: any[] = [];

      if (newsContext.level === "club") {
        // Get club members from context (only populated for admins)
        members = getClubMembers(newsContext.clubId);
      } else if (
        newsContext.level === "subgroup" &&
        newsContext.groupId &&
        newsContext.subgroupId
      ) {
        // Get subgroup members from context
        members = getSubgroupMembers(
          newsContext.clubId,
          newsContext.groupId,
          newsContext.subgroupId,
        );
      } else {
        // Get group members from context
        if (!newsContext.groupId) {
          setMemberCount(0);
          return;
        }
        members = getGroupMembers(newsContext.clubId, newsContext.groupId);
      }

      // Filter by selected roles if any
      let filteredMembers = members;
      if (selectedRoles.length > 0) {
        filteredMembers = members.filter((m: any) => {
          // Deduplicate roles before checking
          const uniqueRoles = [...new Set<string>(m.roles || [])];
          return uniqueRoles.some((role) =>
            selectedRoles.includes(role as ClubRole),
          );
        });
      }

      setMemberCount(filteredMembers.length);
    } catch (error) {
      console.error("Error loading members:", error);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Validation
  const isFormValid = useMemo(() => {
    return title.trim().length > 0 && description.trim().length > 0;
  }, [title, description]);

  // Get target display for header
  const getTargetDisplay = () => {
    if (!newsContext) return "";
    if (newsContext.level === "subgroup" && newsContext.subgroupName) {
      return newsContext.subgroupName;
    }
    if (newsContext.level === "group" && newsContext.groupName) {
      return newsContext.groupName;
    }
    return newsContext.clubName;
  };

  // Create news handler
  const handleCreateNews = async () => {
    if (!newsContext || !user) {
      setModal({
        visible: true,
        title: t("common:error"),
        message: t("screens:createNews.missingContext"),
      });
      return;
    }

    if (!isFormValid) {
      setModal({
        visible: true,
        title: t("common:validation.validationError"),
        message: t("screens:createNews.pleaseFillFields"),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await newsCreationService.createNews({
        clubId: newsContext.clubId,
        clubName: newsContext.clubName,
        title: title.trim(),
        description: description.trim(),
        targetScope: {
          level: newsContext.level,
          groupId: newsContext.groupId,
          groupName: newsContext.groupName,
          subgroupId: newsContext.subgroupId,
          subgroupName: newsContext.subgroupName,
        },
        roleFilter: selectedRoles.length > 0 ? selectedRoles : undefined,
        selectedMemberIds:
          selectedMemberIds.length > 0 ? selectedMemberIds : undefined,
        sendEmail,
        createdBy: user.uid,
        createdByName:
          userProfile?.displayName || user.displayName || "A club member",
      });

      if (response.success) {
        trackNewsCreated();
        setModal({
          visible: true,
          title: t("common:success"),
          message: t("screens:createNews.newsPublished", {
            count: response.totalRecipients,
            emails: response.emailsSent,
          }),
        });
        // Navigate back after success
        setTimeout(() => router.back(), 1500);
      } else {
        setModal({
          visible: true,
          title: t("common:error"),
          message: response.error || t("screens:createNews.failedToCreateNews"),
        });
      }
    } catch (error: any) {
      console.error("Error creating news:", error);
      setModal({
        visible: true,
        title: t("common:error"),
        message: error.message || t("screens:createNews.failedToCreateNews"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update news handler
  const handleUpdateNews = async () => {
    if (!newsContext || !newsId) {
      setModal({
        visible: true,
        title: t("common:error"),
        message: t("screens:createNews.missingContextOrNewsId"),
      });
      return;
    }

    if (!isFormValid) {
      setModal({
        visible: true,
        title: t("common:validation.validationError"),
        message: t("screens:createNews.pleaseFillFields"),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await updateNews(newsContext.clubId, newsId, {
        title: title.trim(),
        description: description.trim(),
      });

      setModal({
        visible: true,
        title: t("common:success"),
        message: t("screens:createNews.newsUpdated"),
      });
      setTimeout(() => router.back(), 1500);
    } catch (error: any) {
      console.error("Error updating news:", error);
      setModal({
        visible: true,
        title: t("common:error"),
        message: error.message || t("screens:createNews.failedToUpdateNews"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete news handler
  const handleDeleteNews = async () => {
    if (!newsContext || !newsId) return;

    setIsSubmitting(true);
    try {
      await deleteNews(newsContext.clubId, newsId);

      setModal({
        visible: true,
        title: t("common:success"),
        message: t("screens:createNews.newsDeleted"),
      });
      setTimeout(() => router.back(), 1500);
    } catch (error: any) {
      console.error("Error deleting news:", error);
      setModal({
        visible: true,
        title: t("common:error"),
        message: error.message || t("screens:createNews.failedToDeleteNews"),
      });
    } finally {
      setIsSubmitting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Role filter handler
  const handleRoleFilterChange = useCallback((roles: ClubRole[]) => {
    setSelectedRoles(roles);
    setShowRoleFilterModal(false);
  }, []);

  // Get recipient label for role filter display
  const getRecipientLabel = (): string => {
    if (selectedRoles.length === 0) return t("screens:createEvent.allRoles");
    if (selectedRoles.length === 1) {
      const role = selectedRoles[0];
      return role === "player-underage"
        ? t("common:youthPlayers")
        : role === "player"
          ? t("common:players")
          : role === "coach"
            ? t("common:coaches")
            : t("common:admins");
    }
    return t("screens:createEvent.rolesSelected", {
      count: selectedRoles.length,
    });
  };

  // Render missing context error
  if (!newsContext) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 16,
              textAlign: "center",
            }}
          >
            Error: No context found. Please navigate from a manage screen.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginTop: 20,
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: theme.colors.secondary,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>
              {t("common:goBack")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.inputBorder,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 16 }}
          >
            <FontAwesome
              name="arrow-left"
              size={20}
              color={theme.colors.text}
            />
          </TouchableOpacity>
          <View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: theme.colors.text,
              }}
            >
              {isEditMode
                ? t("screens:createNews.editNews")
                : t("screens:createNews.createNews")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: theme.colors.textSecondary,
                marginTop: 2,
              }}
            >
              {getTargetDisplay()}
            </Text>
          </View>
        </View>

        {/* Delete button in edit mode */}
        {isEditMode && (
          <TouchableOpacity
            onPress={() => setShowDeleteConfirm(true)}
            style={{ padding: 8 }}
          >
            <Ionicons name="trash-outline" size={24} color="#F44336" />
          </TouchableOpacity>
        )}
      </View>

      {/* Loading indicator */}
      {isLoadingNews ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 32,
          }}
        >
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={{ marginTop: 16, color: theme.colors.text }}>
            {t("screens:createNews.loadingNews")}
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
          enabled={Platform.OS !== "web"}
        >
          <ScrollView
            style={{ flex: 1, padding: 16 }}
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title Input */}
            <View style={{ marginBottom: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                  }}
                >
                  {t("screens:createNews.titleRequired")}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color:
                      title.length > MAX_TITLE_LENGTH
                        ? "#F44336"
                        : theme.colors.textSecondary,
                  }}
                >
                  {t("screens:createNews.titleCharCount", {
                    length: title.length,
                    max: MAX_TITLE_LENGTH,
                  })}
                </Text>
              </View>
              <TextInput
                value={title}
                onChangeText={(text) =>
                  setTitle(text.slice(0, MAX_TITLE_LENGTH))
                }
                placeholder={t("screens:createNews.titlePlaceholder")}
                placeholderTextColor={theme.colors.textSecondary}
                style={{
                  backgroundColor: theme.colors.inputBackground,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                }}
              />
            </View>

            {/* Description Input */}
            <View style={{ marginBottom: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                  }}
                >
                  {t("screens:createNews.contentRequired")}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color:
                      description.length > MAX_DESCRIPTION_LENGTH
                        ? "#F44336"
                        : theme.colors.textSecondary,
                  }}
                >
                  {description.length}/{MAX_DESCRIPTION_LENGTH}
                </Text>
              </View>
              <TextInput
                value={description}
                onChangeText={(text) =>
                  setDescription(text.slice(0, MAX_DESCRIPTION_LENGTH))
                }
                placeholder={t("screens:createNews.contentPlaceholder")}
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                style={{
                  backgroundColor: theme.colors.inputBackground,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  minHeight: 160,
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  marginTop: 4,
                }}
              >
                {t("screens:createNews.wordCount", {
                  words: Math.ceil(description.length / 6),
                })}
              </Text>
            </View>

            {/* Recipients Section (for create mode) */}
            {!isEditMode && (
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                    marginBottom: 8,
                  }}
                >
                  {t("screens:createEvent.recipients")}
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.inputBorder,
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: theme.colors.inputBackground,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <FontAwesome
                      name="users"
                      size={16}
                      color={theme.colors.textSecondary}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={{
                        fontSize: 16,
                        color: theme.colors.text,
                        flex: 1,
                      }}
                    >
                      {newsContext.level === "subgroup"
                        ? newsContext.subgroupName
                        : newsContext.level === "group"
                          ? newsContext.groupName
                          : newsContext.clubName}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: theme.colors.textSecondary,
                      }}
                    >
                      {isLoadingMembers
                        ? "Loading..."
                        : `${memberCount} member${memberCount !== 1 ? "s" : ""}`}
                      {selectedRoles.length > 0 && ` (${getRecipientLabel()})`}
                      {selectedMemberIds.length > 0 &&
                        ` · ${t("screens:createEvent.membersSelected", { count: selectedMemberIds.length })}`}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => {
                          router.push({
                            pathname: "/select-event-members",
                            params: {
                              clubId: newsContext.clubId,
                              clubName: newsContext.clubName,
                              groupId: newsContext.groupId || "",
                              groupName: newsContext.groupName || "",
                              subgroupId: newsContext.subgroupId || "",
                              subgroupName: newsContext.subgroupName || "",
                              level: newsContext.level,
                              sourceScreen: "create-news",
                              roleFilter: selectedRoles.join(","),
                              preSelectedIds: selectedMemberIds.join(","),
                            },
                          });
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 6,
                          backgroundColor:
                            selectedMemberIds.length > 0
                              ? theme.colors.secondary
                              : theme.colors.inputBorder,
                        }}
                      >
                        <FontAwesome
                          name="user-plus"
                          size={14}
                          color={
                            selectedMemberIds.length > 0
                              ? "white"
                              : theme.colors.textSecondary
                          }
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "500",
                            color:
                              selectedMemberIds.length > 0
                                ? "white"
                                : theme.colors.text,
                          }}
                        >
                          {t("screens:createEvent.selectMembers")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setShowRoleFilterModal(true)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 6,
                          backgroundColor:
                            selectedRoles.length > 0
                              ? theme.colors.secondary
                              : theme.colors.inputBorder,
                        }}
                      >
                        <FontAwesome
                          name="filter"
                          size={14}
                          color={
                            selectedRoles.length > 0
                              ? "white"
                              : theme.colors.textSecondary
                          }
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "500",
                            color:
                              selectedRoles.length > 0
                                ? "white"
                                : theme.colors.text,
                          }}
                        >
                          {t("screens:createEvent.filterRoles")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Email Delivery Toggle (only for create mode) */}
            {!isEditMode && (
              <View style={{ marginBottom: 24 }}>
                <View
                  style={{
                    backgroundColor: theme.colors.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.inputBorder,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 16 }}>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Ionicons
                        name="mail-outline"
                        size={20}
                        color={theme.colors.secondary}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: theme.colors.text,
                        }}
                      >
                        {t("screens:createNews.alsoSendAsEmail")}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.colors.textSecondary,
                        marginTop: 4,
                        marginLeft: 28,
                      }}
                    >
                      {t("screens:createNews.emailHint")}
                    </Text>
                  </View>
                  <Switch
                    value={sendEmail}
                    onValueChange={setSendEmail}
                    trackColor={{
                      false: theme.colors.inputBorder,
                      true: theme.colors.secondary,
                    }}
                    thumbColor={sendEmail ? "#fff" : "#f4f3f4"}
                  />
                </View>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              onPress={isEditMode ? handleUpdateNews : handleCreateNews}
              disabled={!isFormValid || isSubmitting}
              style={{
                marginTop: 8,
                backgroundColor: isFormValid
                  ? theme.colors.secondary
                  : theme.colors.inputBorder,
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                {isSubmitting
                  ? isEditMode
                    ? t("screens:createNews.updating")
                    : t("screens:createNews.publishing")
                  : isEditMode
                    ? t("screens:createNews.updateNews")
                    : sendEmail
                      ? t("screens:createNews.publishAndSendEmail")
                      : t("screens:createNews.publishNews")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Role Filter Modal */}
      <RoleFilterModal
        visible={showRoleFilterModal}
        onClose={() => setShowRoleFilterModal(false)}
        selectedRoles={selectedRoles}
        onApply={handleRoleFilterChange}
        level={newsContext?.level}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteConfirm}
        title={t("screens:createNews.deleteNews")}
        message={t("screens:createNews.deleteNewsConfirm")}
        confirmText={t("common:delete")}
        cancelText={t("common:cancel")}
        onConfirm={handleDeleteNews}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmButtonTheme="primary"
      />

      {/* Result Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
        onConfirm={() => setModal((prev) => ({ ...prev, visible: false }))}
        onCancel={() => setModal((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}
