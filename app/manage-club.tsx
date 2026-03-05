import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import CountdownTimer from "@/components/CountdownTimer";
import DeletionConfirmationModal from "@/components/DeletionConfirmationModal";
import { NewsEventFAB } from "@/components/FloatingActionButton";
import MemberContactModal from "@/components/MemberContactModal";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useDataCache } from "@/contexts/DataCacheContext";
import { clubService } from "@/services/club";
import { functions } from "@/services/core/firebase";
import { ClubGroupData, fetchClubGroups } from "@/services/fetchClubGroups";
import { fetchClubMembers } from "@/services/fetchClubMembers";
import { groupService } from "@/services/group";
import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { httpsCallable } from "firebase/functions";
import React, { useCallback, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ClubMemberData {
  userId: string;
  name: string;
  email: string;
  photoURL?: string;
  roles: string[];
  needsGuardian?: boolean;
  clubRole?: string;
  joinedAt?: any;
}

interface ClubData {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: any;
}

export default function ManageClubScreen() {
  const cache = useDataCache();
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const { clubId, tab, deleteMode } = useLocalSearchParams();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [club, setClub] = useState<ClubData | null>(null);
  const [members, setMembers] = useState<ClubMemberData[]>([]);
  const [groups, setGroups] = useState<ClubGroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"members" | "groups">(
    tab === "groups" ? "groups" : "members",
  );
  const [isDeleteMode, setIsDeleteMode] = useState(deleteMode === "true");
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ClubGroupData | null>(
    null,
  );
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [showUndoGroupModal, setShowUndoGroupModal] = useState(false);
  const [isReactivatingGroup, setIsReactivatingGroup] = useState(false);
  const [showForceCleanupModal, setShowForceCleanupModal] = useState(false);
  const [isForceCleaning, setIsForceCleaning] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberData | null>(
    null,
  );
  const [showMemberModal, setShowMemberModal] = useState(false);

  const fetchAllData = useCallback(async () => {
    if (!clubId || typeof clubId !== "string") return;

    setLoading(true);
    try {
      // Fetch club data, members, and groups (include deleted groups for admins)
      const [clubResult, membersResult, groupsResult] = await Promise.all([
        clubService.getClub(clubId, cache),
        fetchClubMembers(clubId, cache),
        fetchClubGroups(clubId, true, cache), // Include deleted groups
      ]);

      // Process club data
      if (clubResult.success && clubResult.data) {
        setClub(clubResult.data as ClubData);
        console.log("🏢 Club data:", {
          clubId: clubResult.data.id,
          clubName: clubResult.data.name,
        });
      }

      // Process members data
      const membersData: ClubMemberData[] = membersResult.success
        ? membersResult.members
        : [];
      if (!membersResult.success && membersResult.error) {
        console.error("❌ Failed to fetch club members:", membersResult.error);
      }
      console.log(
        `📋 Fetched ${membersData.length} members for club ${clubId}:`,
        membersData,
      );
      setMembers(membersData);

      // Process groups data
      const groupsData: ClubGroupData[] = groupsResult.success
        ? groupsResult.groups
        : [];
      if (!groupsResult.success && groupsResult.error) {
        console.error("❌ Failed to fetch club groups:", groupsResult.error);
      }
      console.log(
        `📂 Fetched ${groupsData.length} groups for club ${clubId}:`,
        groupsData,
      );
      setGroups(groupsData);

      // Check if current user is club-admin
      if (user) {
        const currentUserMember = membersData.find(
          (m) => m.userId === user.uid,
        );
        const isAdmin =
          currentUserMember?.clubRole === "club-admin" ||
          currentUserMember?.roles?.includes("club-admin") ||
          false;
        setIsClubAdmin(isAdmin);
        console.log(`🔒 User is club admin: ${isAdmin}`);
      }
    } catch (error) {
      console.error("Error fetching club data:", error);
    } finally {
      setLoading(false);
    }
  }, [clubId, user]);

  const handleDeleteGroup = (group: ClubGroupData) => {
    setSelectedGroup(group);
    setShowDeleteGroupModal(true);
  };

  const confirmDeleteGroup = async () => {
    if (!selectedGroup || !clubId) return;

    setShowDeleteGroupModal(false);
    setIsDeletingGroup(true);

    try {
      const result = await groupService.deleteGroup(
        clubId as string,
        selectedGroup.id,
      );

      if (result.success) {
        // Refresh groups list
        await fetchAllData();
      } else {
        console.error("Failed to delete group:", result.error);
      }
    } catch (error) {
      console.error("Error deleting group:", error);
    } finally {
      setIsDeletingGroup(false);
      setSelectedGroup(null);
    }
  };

  const handleUndoGroupDeletion = (group: ClubGroupData) => {
    setSelectedGroup(group);
    setShowUndoGroupModal(true);
  };

  const confirmUndoGroupDeletion = async () => {
    if (!selectedGroup || !clubId) return;

    setShowUndoGroupModal(false);
    setIsReactivatingGroup(true);

    try {
      const result = await groupService.reactivateGroup(
        clubId as string,
        selectedGroup.id,
      );

      if (result.success) {
        console.log("Group reactivated successfully");
        // Refresh groups list
        await fetchAllData();
      } else {
        console.error("Failed to reactivate group:", result.error);
      }
    } catch (error) {
      console.error("Error reactivating group:", error);
    } finally {
      setIsReactivatingGroup(false);
      setSelectedGroup(null);
    }
  };

  const handleForceCleanup = (group: ClubGroupData) => {
    setSelectedGroup(group);
    setShowForceCleanupModal(true);
  };

  const confirmForceCleanup = async () => {
    if (!selectedGroup || !clubId) return;

    setShowForceCleanupModal(false);
    setIsForceCleaning(true);

    try {
      const devForceCleanupFn = httpsCallable(functions, "devForceCleanup");
      const result = await devForceCleanupFn({
        targetType: "group",
        clubId: clubId,
        groupId: selectedGroup.id,
      });
      console.log("Force cleanup result:", result.data);

      // Refresh groups list
      await fetchAllData();
    } catch (error) {
      console.error("Error force cleaning:", error);
    } finally {
      setIsForceCleaning(false);
      setSelectedGroup(null);
    }
  };

  // Removed useEffect double-fetch. Only useFocusEffect remains.

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchAllData();
    }, [fetchAllData]),
  );

  // Set dynamic header with club name and settings button
  useLayoutEffect(() => {
    if (!club) {
      navigation.setOptions({
        title: "Manage Club",
        headerRight: () => null,
      });
      return;
    }

    navigation.setOptions({
      title: club.name || "Manage Club",
      headerRight: () =>
        isClubAdmin ? (
          <TouchableOpacity
            onPress={() => {
              router.push(`/club-settings?clubId=${clubId}` as any);
            }}
            style={{ marginRight: 8, padding: 8 }}
          >
            <Ionicons
              name="settings-outline"
              size={24}
              color={theme.colors.secondary}
            />
          </TouchableOpacity>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club, isClubAdmin, navigation]);

  const handleMemberPress = (member: ClubMemberData) => {
    if (isClubAdmin) {
      setSelectedMember(member);
      setShowMemberModal(true);
    }
  };

  const renderMemberItem = ({ item }: { item: ClubMemberData }) => {
    const content = (
      <>
        <Image
          style={styles.memberAvatar}
          source={{
            uri: item.photoURL || getDefaultProfilePicture(item.needsGuardian),
          }}
        />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberRole}>
            {item.clubRole || [...new Set(item.roles)]?.join(", ") || "member"}
            {item.needsGuardian && " (Child/Youth)"}
          </Text>
        </View>
        {isClubAdmin && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textSecondary}
          />
        )}
      </>
    );

    if (isClubAdmin) {
      return (
        <TouchableOpacity
          style={styles.memberItem}
          onPress={() => handleMemberPress(item)}
          activeOpacity={0.7}
        >
          {content}
        </TouchableOpacity>
      );
    }

    return <View style={styles.memberItem}>{content}</View>;
  };

  const renderGroupItem = ({ item }: { item: ClubGroupData }) => {
    const isScheduledForDeletion =
      item.isActive === false && item.deletionScheduledAt;

    return (
      <View style={styles.groupItemContainer}>
        <View style={styles.groupItem}>
          <TouchableOpacity
            style={styles.groupTouchable}
            onPress={() =>
              router.push(
                `/manage-group?groupId=${item.id}&clubId=${clubId}&clubName=${encodeURIComponent(club?.name || "")}` as any,
              )
            }
          >
            <View style={styles.groupInfo}>
              <Text style={styles.groupName}>{item.name}</Text>
              <View style={styles.groupMeta}>
                {item.sport && (
                  <Text style={styles.groupSport}>
                    <Ionicons
                      name="football-outline"
                      size={14}
                      color={theme.colors.textSecondary}
                    />{" "}
                    {item.sport}
                  </Text>
                )}
                <Text style={styles.groupMembers}>
                  <Ionicons
                    name="people-outline"
                    size={14}
                    color={theme.colors.textSecondary}
                  />{" "}
                  {item.membersCount}{" "}
                  {item.membersCount === 1
                    ? t("common:member")
                    : t("common:members")}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
          {isClubAdmin && isDeleteMode && item.isActive !== false && (
            <TouchableOpacity
              style={styles.deleteGroupButton}
              onPress={() => handleDeleteGroup(item)}
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={theme.colors.error}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Deletion Status Banner for this group */}
        {isScheduledForDeletion && (
          <View style={styles.groupDeletionBanner}>
            <View style={styles.deletionHeader}>
              <Ionicons name="warning" size={20} color={theme.colors.error} />
              <Text style={styles.deletionTitle}>
                {t("screens:manageClub.scheduledForDeletion")}
              </Text>
            </View>
            <Text style={styles.deletionMessage}>
              {t("screens:manageClub.permanentlyDeletedIn")}
            </Text>
            <CountdownTimer
              deletionScheduledAt={item.deletionScheduledAt?.toMillis?.()}
              compact={true}
            />
            {isClubAdmin && (
              <View style={styles.groupActionButtons}>
                <View style={styles.undoButton}>
                  <Button
                    label={
                      isReactivatingGroup
                        ? t("common:reactivating")
                        : t("screens:groupSettings.undoDeletion")
                    }
                    onPress={() => handleUndoGroupDeletion(item)}
                    theme="secondary"
                    disabled={isReactivatingGroup}
                  />
                </View>
                {__DEV__ && (
                  <TouchableOpacity
                    style={styles.devButton}
                    onPress={() => handleForceCleanup(item)}
                    disabled={isForceCleaning}
                  >
                    <Text style={styles.devButtonText}>
                      🧪 DEV: Force Delete Now
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:manageClub.loadingClub")}
          </Text>
        </View>
      </View>
    );
  }

  if (!club) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t("screens:manageClub.clubNotFound")}
          </Text>
          <Button
            label={t("common:goBack")}
            onPress={() => router.back()}
            theme="secondary"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Delete Mode Banner */}
        {isDeleteMode && (
          <View style={styles.deleteModeBanner}>
            <View style={styles.deleteModeBannerContent}>
              <Ionicons
                name="trash-outline"
                size={20}
                color={theme.colors.error}
              />
              <Text style={styles.deleteModeBannerText}>
                {t("screens:manageClub.selectGroupToDelete")}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteModeCancelButton}
              onPress={() => {
                setIsDeleteMode(false);
                router.back();
              }}
            >
              <Text style={styles.deleteModeCancelText}>
                {t("common:cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "members" && styles.activeTab]}
            onPress={() => setActiveTab("members")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "members" && styles.activeTabText,
              ]}
            >
              {t("screens:manageClub.members")} ({members.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "groups" && styles.activeTab]}
            onPress={() => setActiveTab("groups")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "groups" && styles.activeTabText,
              ]}
            >
              {t("screens:manageClub.groups")} ({groups.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content based on active tab */}
        {activeTab === "members" ? (
          // Members List
          members.length > 0 ? (
            <FlatList
              data={members}
              renderItem={renderMemberItem}
              keyExtractor={(item) => item.userId}
              scrollEnabled={false}
              style={styles.membersList}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {t("screens:manageClub.noMembers")}
              </Text>
            </View>
          )
        ) : // Groups List
        groups.length > 0 ? (
          <FlatList
            data={groups}
            renderItem={renderGroupItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            style={styles.groupsList}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {t("screens:manageClub.noGroups")}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Delete Group Confirmation Modal */}
      <DeletionConfirmationModal
        visible={showDeleteGroupModal}
        title={t("screens:manageClub.deleteGroup")}
        entityName={selectedGroup?.name || "this group"}
        entityType="group"
        gracePeriodDays={30}
        affectedCount={0}
        onConfirm={confirmDeleteGroup}
        onCancel={() => {
          setShowDeleteGroupModal(false);
          setSelectedGroup(null);
        }}
        isDeleting={isDeletingGroup}
      />

      {/* Undo Group Deletion Modal */}
      <ConfirmationModal
        visible={showUndoGroupModal}
        title={t("screens:groupSettings.undoDeletion")}
        message={t("screens:groupSettings.undoDeletionConfirm", {
          name: selectedGroup?.name,
        })}
        confirmText={
          isReactivatingGroup
            ? t("common:reactivating")
            : t("screens:groupSettings.reactivate")
        }
        cancelText={t("common:cancel")}
        onConfirm={confirmUndoGroupDeletion}
        onCancel={() => {
          setShowUndoGroupModal(false);
          setSelectedGroup(null);
        }}
      />

      {/* Force Cleanup Modal (DEV only) */}
      {__DEV__ && (
        <ConfirmationModal
          visible={showForceCleanupModal}
          title="🧪 DEV: Force Hard Delete"
          message={`⚠️ WARNING: This will IMMEDIATELY and PERMANENTLY delete "${selectedGroup?.name}" without waiting for the grace period. This action cannot be undone. Use only for testing!`}
          confirmText={isForceCleaning ? "Deleting..." : "Force Delete Now"}
          cancelText="Cancel"
          onConfirm={confirmForceCleanup}
          onCancel={() => {
            setShowForceCleanupModal(false);
            setSelectedGroup(null);
          }}
        />
      )}

      {/* FAB: Create Club-wide Event or News */}
      {isClubAdmin && (
        <NewsEventFAB
          onNewsPress={() => {
            router.push({
              pathname: "/create-news" as any,
              params: {
                clubId: clubId as string,
                clubName: club?.name || "",
                sourceScreen: "manage-club",
              },
            });
          }}
          onEventPress={() => {
            router.push({
              pathname: "/create-event" as any,
              params: {
                clubId: clubId as string,
                clubName: club?.name || "",
                sourceScreen: "manage-club",
                memberCount: members.length,
              },
            });
          }}
        />
      )}

      {/* Member Contact Details Modal */}
      {selectedMember && (
        <MemberContactModal
          visible={showMemberModal}
          onClose={() => {
            setShowMemberModal(false);
            setSelectedMember(null);
          }}
          userId={selectedMember.userId}
          clubId={clubId as string}
          initialName={selectedMember.name}
          initialPhotoURL={selectedMember.photoURL}
          isYouth={selectedMember.needsGuardian}
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  membersList: {
    marginBottom: theme.spacing.lg,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.secondary,
    marginRight: theme.spacing.md,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    marginBottom: theme.spacing.xl,
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  tabContainer: {
    flexDirection: "row",
    marginBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: theme.colors.secondary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  groupsList: {
    marginBottom: theme.spacing.lg,
  },
  groupItemContainer: {
    marginBottom: theme.spacing.sm,
  },
  groupItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  groupTouchable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  deleteGroupButton: {
    padding: theme.spacing.md,
    paddingLeft: theme.spacing.sm,
  },
  deleteModeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.error + "15",
    borderWidth: 1,
    borderColor: theme.colors.error + "40",
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  deleteModeBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  deleteModeBannerText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.error,
  },
  deleteModeCancelButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  deleteModeCancelText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  groupMeta: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  groupSport: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  groupMembers: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  groupDeletionBanner: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginTop: theme.spacing.xs,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  deletionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.xs,
  },
  deletionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.error,
    marginLeft: theme.spacing.xs,
  },
  deletionMessage: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  groupActionButtons: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  undoButton: {
    marginBottom: theme.spacing.xs,
  },
  devButton: {
    backgroundColor: "#FFA500",
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
    alignItems: "center",
  },
  devButtonText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
});
