import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import CountdownTimer from "@/components/CountdownTimer";
import DeletionConfirmationModal from "@/components/DeletionConfirmationModal";
import { NewsEventFAB } from "@/components/FloatingActionButton";
import GroupFilterBar from "@/components/GroupFilterBar";
import HierarchyBreadcrumb from "@/components/HierarchyBreadcrumb";
import MemberContactModal from "@/components/MemberContactModal";
import MemberFilterBar, {
    type RoleFilter,
    type RoleOption,
    type StatusFilter,
} from "@/components/MemberFilterBar";
import { FeatureHighlight } from "@/components/onboarding";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useClubData } from "@/contexts/ClubDataContext";
import { useDataCache } from "@/contexts/DataCacheContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useUser } from "@/contexts/UserContext";
import { useHasSeenFeature } from "@/hooks/useOnboardingFeatureTracker";
import { functions } from "@/services/core/firebase";
import { ClubGroupData, fetchClubGroups } from "@/services/fetchClubGroups";
import { groupService } from "@/services/group";
import type { ClubMemberData } from "@/services/types/club";
import { isClubAdmin as checkIsClubAdmin } from "@/utils/permissionHelpers";
import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { httpsCallable } from "firebase/functions";
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ManageClubScreen() {
  const cache = useDataCache();
  const { t } = useTranslation(["screens", "common", "components"]);
  const insets = useSafeAreaInsets();
  const { clubId, tab, deleteMode } = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const { getClub, getClubMembers } = useClubData();
  const navigation = useNavigation();

  // Derive club data and members from real-time context
  const club = getClub(clubId as string);
  const contextMembers = getClubMembers(clubId as string);
  const isAdmin = useMemo(
    () => checkIsClubAdmin(userProfile, clubId as string),
    [userProfile, clubId],
  );
  const hasSeenClubSettings = useHasSeenFeature("club-settings-viewed");
  const hasSeenClubEvents = useHasSeenFeature("club-events-fab-seen");
  const hasSeenClubNews = useHasSeenFeature("club-news-fab-seen");
  const { markFeatureSeen } = useOnboarding();

  const [groups, setGroups] = useState<ClubGroupData[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [refreshing, setRefreshing] = useState(false);

  // ── Member filter state ───────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Group filter state ────────────────────────────────────────────
  const [groupStatusFilter, setGroupStatusFilter] =
    useState<StatusFilter>("active");
  const [groupSportFilter, setGroupSportFilter] = useState("all");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  const clubRoleOptions: RoleOption[] = useMemo(
    () => [
      { value: "all", label: t("components:memberFilterBar.all") },
      { value: "player", label: t("components:memberFilterBar.player") },
      {
        value: "player-underage",
        label: t("components:memberFilterBar.playerUnderage"),
      },
      { value: "coach", label: t("components:memberFilterBar.coach") },
      { value: "admin", label: t("components:memberFilterBar.admin") },
      {
        value: "club-admin",
        label: t("components:memberFilterBar.clubAdmin"),
      },
      { value: "guardian", label: t("components:memberFilterBar.guardian") },
    ],
    [t],
  );

  // Unique sport values present across all loaded groups (case-insensitive dedup)
  const availableSports = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const g of groups) {
      if (!g.sport?.trim()) continue;
      const key = g.sport.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(g.sport.trim());
      }
    }
    return result;
  }, [groups]);

  // Derived filtered groups list
  const filteredGroups = useMemo(() => {
    let result = groups;

    // Status filter
    if (groupStatusFilter === "active") {
      result = result.filter((g) => g.isActive !== false);
    } else if (groupStatusFilter === "inactive") {
      result = result.filter((g) => g.isActive === false);
    }

    // Sport filter
    if (groupSportFilter !== "all") {
      result = result.filter(
        (g) =>
          g.sport?.trim().toLowerCase() ===
          groupSportFilter.trim().toLowerCase(),
      );
    }

    // Search filter (group name)
    if (groupSearchQuery.trim()) {
      const q = groupSearchQuery.trim().toLowerCase();
      result = result.filter((g) => g.name?.toLowerCase().includes(q));
    }

    return result;
  }, [groups, groupStatusFilter, groupSportFilter, groupSearchQuery]);

  // Derived filtered member list
  const filteredMembers = useMemo(() => {
    let result = contextMembers;

    // Status filter
    if (statusFilter === "active") {
      result = result.filter((m) => m.isActive !== false);
    } else if (statusFilter === "inactive") {
      result = result.filter((m) => m.isActive === false);
    }
    // 'all' → no status filtering

    // Role filter
    if (roleFilter !== "all") {
      result = result.filter((m) => m.roles.includes(roleFilter));
    }

    // Search filter (name or email)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [contextMembers, statusFilter, roleFilter, searchQuery]);

  const isMemberFilterActive =
    statusFilter === "inactive" || roleFilter !== "all" || !!searchQuery.trim();

  const isGroupFilterActive =
    groupStatusFilter !== "active" ||
    groupSportFilter !== "all" ||
    !!groupSearchQuery.trim();

  const isFilterActive =
    activeTab === "members" ? isMemberFilterActive : isGroupFilterActive;

  const fetchAllData = useCallback(async () => {
    if (!clubId || typeof clubId !== "string") return;

    setLoading(true);
    try {
      // Only fetch groups manually — club data & members come from real-time context
      const groupsResult = await fetchClubGroups(clubId, true, cache); // Include deleted groups

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
    } catch (error) {
      console.error("Error fetching club data:", error);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

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

  // Pull-to-refresh: clear groups cache then re-fetch
  const onRefresh = useCallback(async () => {
    if (!clubId || typeof clubId !== "string") return;
    setRefreshing(true);
    cache.remove(`clubGroups_${clubId}_true`);
    cache.remove(`clubGroups_${clubId}_false`);
    await fetchAllData();
    setRefreshing(false);
  }, [clubId, cache, fetchAllData]);

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
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Filter toggle */}
          <TouchableOpacity
            onPress={() => setShowFilters((prev) => !prev)}
            style={{ padding: 8 }}
          >
            <Ionicons
              name={isFilterActive ? "filter" : "filter-outline"}
              size={24}
              color={
                isFilterActive ? theme.colors.secondary : theme.colors.secondary
              }
            />
            {isFilterActive && (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.colors.error,
                }}
              />
            )}
          </TouchableOpacity>
          {/* Settings gear (admin only) */}
          {isAdmin && (
            <FeatureHighlight
              active={!hasSeenClubSettings}
              borderRadius={20}
              coachMark={
                !hasSeenClubSettings
                  ? t("components:onboarding.coachMarks.clubSettings")
                  : undefined
              }
              coachMarkPosition="left"
              onDismiss={() => markFeatureSeen("club-settings-viewed")}
            >
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
            </FeatureHighlight>
          )}
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club, isAdmin, navigation, isFilterActive]);

  const handleMemberPress = (member: ClubMemberData) => {
    if (isAdmin) {
      setSelectedMember(member);
      setShowMemberModal(true);
    }
  };

  const renderMemberItem = ({ item }: { item: ClubMemberData }) => {
    const isInactive = item.isActive === false;
    const content = (
      <>
        <Image
          style={[
            styles.memberAvatar,
            isInactive && styles.memberAvatarInactive,
          ]}
          source={{
            uri: item.photoURL || getDefaultProfilePicture(item.needsGuardian),
          }}
        />
        <View style={styles.memberInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={[
                styles.memberName,
                isInactive && styles.memberNameInactive,
              ]}
            >
              {item.name}
            </Text>
            {isInactive && (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveBadgeText}>
                  {t("components:memberFilterBar.inactive")}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.memberRole}>
            {[...new Set(item.roles)]?.join(", ") || "member"}
            {item.needsGuardian && " (Child/Youth)"}
          </Text>
        </View>
        {isAdmin && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textSecondary}
          />
        )}
      </>
    );

    if (isAdmin) {
      return (
        <TouchableOpacity
          style={[styles.memberItem, isInactive && styles.memberItemInactive]}
          onPress={() => handleMemberPress(item)}
          activeOpacity={0.7}
        >
          {content}
        </TouchableOpacity>
      );
    }

    return (
      <View
        style={[styles.memberItem, isInactive && styles.memberItemInactive]}
      >
        {content}
      </View>
    );
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
          {isAdmin && isDeleteMode && item.isActive !== false && (
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
            {isAdmin && (
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

  const listHeader = (
    <>
      <HierarchyBreadcrumb
        segments={[
          {
            iconName: "trophy-outline",
            label: club.name || "Club",
            isCurrent: true,
          },
        ]}
      />
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
            {t("screens:manageClub.members")} ({filteredMembers.length})
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
            {t("screens:manageClub.groups")} ({filteredGroups.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Bar (toggled from header icon) */}
      {showFilters && activeTab === "members" && (
        <MemberFilterBar
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          roleFilter={roleFilter}
          onRoleChange={setRoleFilter}
          availableRoles={clubRoleOptions}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      )}
      {showFilters && activeTab === "groups" && (
        <GroupFilterBar
          statusFilter={groupStatusFilter}
          onStatusChange={setGroupStatusFilter}
          sportFilter={groupSportFilter}
          onSportChange={setGroupSportFilter}
          availableSports={availableSports}
          searchQuery={groupSearchQuery}
          onSearchChange={setGroupSearchQuery}
        />
      )}
    </>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      {activeTab === "members" ? (
        <FlatList
          data={filteredMembers}
          renderItem={renderMemberItem}
          keyExtractor={(item) => item.userId}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {t("screens:manageClub.noMembers")}
              </Text>
            </View>
          }
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
        />
      ) : (
        <FlatList
          data={filteredGroups}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {t("screens:manageClub.noGroups")}
              </Text>
            </View>
          }
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
        />
      )}

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
      {isAdmin && (
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
                memberCount: contextMembers.length,
              },
            });
          }}
          newsHighlight={{
            active: !hasSeenClubNews,
            coachMark: t("components:onboarding.coachMarks.clubNewsFab"),
            onDismiss: () => markFeatureSeen("club-news-fab-seen"),
          }}
          eventHighlight={{
            active: !hasSeenClubEvents,
            coachMark: t("components:onboarding.coachMarks.clubEventFab"),
            onDismiss: () => markFeatureSeen("club-events-fab-seen"),
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
          isAdminViewing={isAdmin}
          isInactive={selectedMember.isActive === false}
          scheduledForDeletion={selectedMember.scheduledForDeletion}
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
  // Inactive member styles
  memberItemInactive: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
  },
  memberAvatarInactive: {
    opacity: 0.5,
  },
  memberNameInactive: {
    opacity: 0.7,
  },
  inactiveBadge: {
    backgroundColor: theme.colors.error + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.error,
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
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.primary,
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
