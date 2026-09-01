import Button from "@/components/Button";
import { NewsEventFAB } from "@/components/FloatingActionButton";
import HierarchyBreadcrumb from "@/components/HierarchyBreadcrumb";
import MemberContactModal from "@/components/MemberContactModal";
import MemberFilterBar, {
    type RoleFilter,
    type RoleOption,
    type StatusFilter,
} from "@/components/MemberFilterBar";
import { ScreenTooltipManager } from "@/components/onboarding";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useUser } from "@/contexts/UserContext";
import { useTrackFeatureOnMount } from "@/hooks/useOnboardingFeatureTracker";
import { db } from "@/services/core/firebase";
import { SubGroup } from "@/services/subgroup";
import { GroupMemberData } from "@/services/types/group";
import { shouldShowManageGroupLoading } from "@/utils/manageGroupScreenState";
import {
    canManageGroup,
    isClubAdmin,
    isGroupMember,
} from "@/utils/permissionHelpers";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ManageGroupScreen() {
  const { t } = useTranslation(["screens", "common", "components"]);
  const insets = useSafeAreaInsets();
  const { groupId, clubId, clubName, tab } = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  useTrackFeatureOnMount("group-managed");
  const {
    getGroup,
    getGroupMembers,
    getSubgroups: getSubgroupsFromCtx,
    isLoading: isGroupDataLoading,
  } = useGroupData();
  const navigation = useNavigation();

  // Derive data from real-time context
  const group = getGroup(clubId as string, groupId as string);
  const contextMembers = getGroupMembers(clubId as string, groupId as string);
  const contextSubgroups = getSubgroupsFromCtx(
    clubId as string,
    groupId as string,
  );
  const [fallbackGroup, setFallbackGroup] = useState<any | null>(null);
  const [fallbackMembers, setFallbackMembers] = useState<GroupMemberData[]>([]);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  // Derive subgroups in the format the UI expects (SubGroup interface)
  const subgroups: SubGroup[] = useMemo(
    () =>
      (contextSubgroups || []).map((sg) => ({
        id: sg.id,
        name: sg.name,
        createdBy: sg.createdBy || "",
        createdAt: sg.createdAt || null,
        description: sg.description || "",
        color: sg.color || "",
        memberCount: sg.memberCount || 0,
      })),
    [contextSubgroups],
  );

  // Derive permission from userProfile (sync)
  const canManage = useMemo(
    () => canManageGroup(userProfile, clubId as string, groupId as string),
    [userProfile, clubId, groupId],
  );

  const isClubAdminUser = useMemo(
    () => isClubAdmin(userProfile, clubId as string),
    [userProfile, clubId],
  );

  // Any group member (player/coach/admin) can see the settings cog
  // Guardians are NOT group members — they access via dependents only
  const isMember = useMemo(
    () => isGroupMember(userProfile, clubId as string, groupId as string),
    [userProfile, clubId, groupId],
  );

  // Check if user is a guardian of a specific member
  const isGuardianOf = useMemo(() => {
    const dependentUids = new Set(
      (userProfile?.dependents || []).map((d) => d.uid),
    );
    return (memberId: string) => dependentUids.has(memberId);
  }, [userProfile?.dependents]);

  const effectiveGroup = group || fallbackGroup;
  const effectiveMembers = contextMembers.length
    ? contextMembers
    : fallbackMembers;

  // True when the current user is a guardian of at least one active member in this group.
  // Guardians are not group members (no groupAccess) but should be able to view all member
  // contact details — including other players, coaches, and guardian contacts for youth members.
  const isGuardianInGroup = useMemo(() => {
    if (!userProfile?.dependents?.length) return false;
    const dependentUids = new Set(
      (userProfile.dependents as { uid: string }[]).map((d) => d.uid),
    );
    return effectiveMembers.some(
      (m) => dependentUids.has(m.userId) && m.isActive !== false,
    );
  }, [userProfile?.dependents, effectiveMembers]);
  const loading = shouldShowManageGroupLoading({
    hasGroup: !!effectiveGroup,
    memberCount: effectiveMembers.length,
    isGroupDataLoading,
    loadingTimedOut,
  });

  const [activeTab, setActiveTab] = useState<"members" | "subgroups">(
    tab === "subgroups" ? "subgroups" : "members",
  );
  const [selectedMember, setSelectedMember] = useState<GroupMemberData | null>(
    null,
  );
  const [showMemberModal, setShowMemberModal] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const groupRoleOptions: RoleOption[] = useMemo(
    () => [
      { value: "all", label: t("components:memberFilterBar.all") },
      { value: "player", label: t("components:memberFilterBar.player") },
      {
        value: "player-underage",
        label: t("components:memberFilterBar.playerUnderage"),
      },
      { value: "coach", label: t("components:memberFilterBar.coach") },
      { value: "admin", label: t("components:memberFilterBar.admin") },
    ],
    [t],
  );

  // Derived filtered member list
  const filteredMembers = useMemo(() => {
    let result = effectiveMembers;

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

    return result;
  }, [effectiveMembers, statusFilter, roleFilter]);

  const isFilterActive = statusFilter === "inactive" || roleFilter !== "all";

  useEffect(() => {
    if (!clubId || !groupId) return;

    setLoadingTimedOut(false);
    const timeoutId = setTimeout(() => {
      setLoadingTimedOut(true);
    }, 7000);

    return () => clearTimeout(timeoutId);
  }, [clubId, groupId]);

  useEffect(() => {
    if (!clubId || !groupId || !canManage || group) {
      setFallbackGroup(null);
      setFallbackMembers([]);
      return;
    }

    const groupDocRef = doc(
      db,
      "clubs",
      clubId as string,
      "groups",
      groupId as string,
    );
    const membersDocRef = doc(
      db,
      "clubs",
      clubId as string,
      "groups",
      groupId as string,
      "allMembers",
      "members",
    );

    const unsubGroup = onSnapshot(
      groupDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setFallbackGroup({ ...snapshot.data(), id: snapshot.id });
        } else {
          setFallbackGroup(null);
        }
      },
      (error) => {
        console.error("❌ ManageGroup fallback group listener error:", error);
      },
    );

    const unsubMembers = onSnapshot(
      membersDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setFallbackMembers(
            (snapshot.data().members || []) as GroupMemberData[],
          );
        } else {
          setFallbackMembers([]);
        }
      },
      (error) => {
        console.error("❌ ManageGroup fallback members listener error:", error);
      },
    );

    return () => {
      unsubGroup();
      unsubMembers();
    };
  }, [canManage, clubId, group, groupId]);

  // Set dynamic header with group name and settings button
  useLayoutEffect(() => {
    if (!effectiveGroup) {
      navigation.setOptions({
        title: "Manage Group",
        headerRight: () => null,
      });
      return;
    }

    navigation.setOptions({
      title: effectiveGroup.name || "Manage Group",
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
              color={theme.colors.secondary}
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
          {/* Settings gear (visible to all group members) */}
          {isMember && (
            <TouchableOpacity
              onPress={() => {
                router.push(
                  `/group-settings?groupId=${groupId}&clubId=${clubId}` as any,
                );
              }}
              style={{ marginRight: 8, padding: 8 }}
            >
              <Ionicons
                name="settings-outline"
                size={24}
                color={theme.colors.secondary}
              />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveGroup, canManage, isMember, navigation, isFilterActive]);

  const handleSubgroupClick = (subgroupId: string, subgroupName: string) => {
    router.push(
      `/manage-subgroup?groupId=${groupId}&clubId=${clubId}&subgroupId=${subgroupId}&subgroupName=${encodeURIComponent(subgroupName)}` as any,
    );
  };

  const handleMemberPress = (member: GroupMemberData) => {
    if (
      canManage ||
      isGuardianOf(member.userId) ||
      isMember ||
      isGuardianInGroup
    ) {
      setSelectedMember(member);
      setShowMemberModal(true);
    }
  };

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
    const canTap =
      canManage || isGuardianOf(item.userId) || isMember || isGuardianInGroup;
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
            {item.roles.join(", ")} {item.needsGuardian && "(Child/Youth)"}
          </Text>
        </View>
        {canTap && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textSecondary}
          />
        )}
      </>
    );

    if (canTap) {
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

  const renderSubgroupItem = ({ item }: { item: SubGroup }) => {
    return (
      <TouchableOpacity
        style={styles.subgroupItem}
        onPress={() => handleSubgroupClick(item.id, item.name)}
      >
        <View style={styles.subgroupContent}>
          <View style={styles.subgroupHeaderLeft}>
            <Text style={styles.subgroupName}>{item.name}</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={24}
            color={theme.colors.textSecondary}
          />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:manageGroup.loadingGroup")}
          </Text>
        </View>
      </View>
    );
  }

  if (!effectiveGroup) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t("screens:manageGroup.groupNotFound")}
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

  const breadcrumbSegments = [
    {
      iconName: "trophy-outline" as const,
      label: typeof clubName === "string" ? clubName : "Club",
      isCurrent: false,
      onPress: isClubAdminUser
        ? () => router.push(`/manage-club?clubId=${clubId}` as any)
        : undefined,
    },
    {
      iconName: "people-outline" as const,
      label: effectiveGroup.name || "Group",
      isCurrent: true,
    },
  ];

  const listHeader = (
    <>
      <HierarchyBreadcrumb segments={breadcrumbSegments} />
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
            {t("screens:manageGroup.members")} ({filteredMembers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "subgroups" && styles.activeTab]}
          onPress={() => setActiveTab("subgroups")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "subgroups" && styles.activeTabText,
            ]}
          >
            {t("screens:manageGroup.subgroups")} (
            {effectiveGroup?.subGroups?.length || 0})
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
          availableRoles={groupRoleOptions}
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
                {t("screens:manageGroup.noMembers")}
              </Text>
            </View>
          }
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={subgroups}
          renderItem={renderSubgroupItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {t("screens:manageGroup.noSubgroups")}
              </Text>
            </View>
          }
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Buttons for Create News & Event */}
      {canManage && (
        <NewsEventFAB
          onNewsPress={() => {
            router.push({
              pathname: "/create-news" as any,
              params: {
                clubId: clubId as string,
                clubName: clubName as string,
                groupId: groupId as string,
                groupName: effectiveGroup?.name || "",
                sourceScreen: "manage-group",
              },
            });
          }}
          onEventPress={() => {
            // DEBUG: Log params before navigation
            console.log("🔍 ManageGroup - Before navigating to create-event:", {
              clubId,
              clubName,
              groupId,
              groupName: effectiveGroup?.name,
              clubIdValue: clubId as string,
              clubNameValue: clubName as string,
            });

            router.push({
              pathname: "/create-event" as any,
              params: {
                clubId: clubId as string,
                clubName: clubName as string,
                groupId: groupId as string,
                groupName: effectiveGroup?.name || "",
                sourceScreen: "manage-group",
                memberCount: effectiveMembers.length,
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
          groupId={groupId as string}
          initialName={selectedMember.name}
          initialPhotoURL={selectedMember.photoURL}
          isYouth={selectedMember.needsGuardian}
          isGuardianViewing={isGuardianOf(selectedMember.userId)}
          isAdminViewing={canManage}
          isPeerViewing={
            !canManage &&
            !isGuardianOf(selectedMember.userId) &&
            (isMember || isGuardianInGroup)
          }
          isInactive={selectedMember.isActive === false}
          scheduledForDeletion={selectedMember.scheduledForDeletion}
        />
      )}
      <ScreenTooltipManager screen="manage-group" />
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.lg,
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.large,
    textAlign: "center",
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
    borderRadius: theme.borderRadius.small,
    padding: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: "500",
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: "bold",
  },
  membersList: {
    flex: 1,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: theme.spacing.md,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 2,
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
  subgroupsList: {
    flex: 1,
  },
  subgroupItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  subgroupContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing.md,
  },
  subgroupHeaderLeft: {
    flex: 1,
  },
  subgroupName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 2,
  },
  subgroupCount: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  subgroupDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
});
