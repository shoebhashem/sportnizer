import Button from "@/components/Button";
import { NewsEventFAB } from "@/components/FloatingActionButton";
import MemberContactModal from "@/components/MemberContactModal";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Import new services
import { useDataCache } from "@/contexts/DataCacheContext";
import { fetchGroupMembers } from "@/services/fetchGroupMembers";
import { groupService } from "@/services/group";
import { permissionService } from "@/services/permissions";
import { SubGroup } from "@/services/subgroup";
import { GroupData, GroupMemberData } from "@/services/types/group";

export default function ManageGroupScreen() {
  const cache = useDataCache();
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const { groupId, clubId, clubName, tab } = useLocalSearchParams();
  const { user } = useAuth();
  const navigation = useNavigation();

  // DEBUG: Log navigation params
  console.log("🔍 ManageGroup - Navigation Params:", {
    groupId,
    clubId,
    clubName,
    tab,
    clubIdType: typeof clubId,
    clubNameType: typeof clubName,
  });

  const [group, setGroup] = useState<GroupData | null>(null);
  const [members, setMembers] = useState<GroupMemberData[]>([]);
  const [subgroups, setSubgroups] = useState<SubGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [activeTab, setActiveTab] = useState<"members" | "subgroups">(
    tab === "subgroups" ? "subgroups" : "members",
  );
  const [selectedMember, setSelectedMember] = useState<GroupMemberData | null>(
    null,
  );
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllData = useCallback(async () => {
    if (
      !groupId ||
      typeof groupId !== "string" ||
      !clubId ||
      typeof clubId !== "string"
    )
      return;

    setLoading(true);
    try {
      // Fetch group data and members (subgroups are now in group.subGroups array)
      const [groupResult, membersResult] = await Promise.all([
        groupService.getGroup(clubId, groupId, cache),
        fetchGroupMembers(clubId, groupId, cache),
      ]);

      // Process group data
      if (groupResult.success && groupResult.data) {
        setGroup(groupResult.data);
        console.log("📂 Group data:", {
          groupId: groupResult.data.id,
          groupName: groupResult.data.name,
          subGroupsRaw: groupResult.data.subGroups,
          subGroupsLength: groupResult.data.subGroups?.length || 0,
        });
        // Convert subGroups array from group document to SubGroup format
        const subgroupsFromGroup = (groupResult.data.subGroups || []).map(
          (sg) => ({
            id: sg.id,
            name: sg.name,
            createdBy: "",
            createdAt: null,
            description: "",
            color: "",
            memberCount: 0, // Will show count if needed later
          }),
        );
        console.log("📂 Converted subgroups:", subgroupsFromGroup);
        setSubgroups(subgroupsFromGroup);
      }

      // Process members data
      const membersData: GroupMemberData[] = membersResult.success
        ? membersResult.members
        : [];
      if (!membersResult.success && membersResult.error) {
        console.error("❌ Failed to fetch group members:", membersResult.error);
      }
      console.log(
        `📋 Fetched ${membersData.length} members for group ${groupId}:`,
        membersData,
      );
      setMembers(membersData);

      // Check if user can manage this group
      if (user && groupId && clubId) {
        const hasPermission = await permissionService.canManageGroup(
          user.uid,
          clubId as string,
          groupId as string,
        );
        setCanManage(hasPermission);
        console.log(`🔒 User can manage group: ${hasPermission}`);
      }
    } catch (error) {
      console.error("Error fetching group data:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, user]);

  // Pull-to-refresh: clear cache then re-fetch
  const onRefresh = useCallback(async () => {
    if (
      !clubId ||
      typeof clubId !== "string" ||
      !groupId ||
      typeof groupId !== "string"
    )
      return;
    setRefreshing(true);
    cache.remove(`groupData_${clubId}_${groupId}`);
    cache.remove(`groupMembers_${clubId}_${groupId}`);
    await fetchAllData();
    setRefreshing(false);
  }, [clubId, groupId, cache, fetchAllData]);

  // Removed useEffect double-fetch. Only useFocusEffect remains.

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchAllData();
    }, [fetchAllData]),
  );

  // Set dynamic header with group name and settings button
  useLayoutEffect(() => {
    if (!group) {
      navigation.setOptions({
        title: "Manage Group",
        headerRight: () => null,
      });
      return;
    }

    navigation.setOptions({
      title: group.name || "Manage Group",
      headerRight: () =>
        canManage ? (
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
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, canManage, navigation]);

  const handleSubgroupClick = (subgroupId: string, subgroupName: string) => {
    router.push(
      `/manage-subgroup?groupId=${groupId}&clubId=${clubId}&subgroupId=${subgroupId}&subgroupName=${encodeURIComponent(subgroupName)}` as any,
    );
  };

  const handleMemberPress = (member: GroupMemberData) => {
    if (canManage) {
      setSelectedMember(member);
      setShowMemberModal(true);
    }
  };

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
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
            {item.roles.join(", ")} {item.needsGuardian && "(Child/Youth)"}
          </Text>
        </View>
        {canManage && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textSecondary}
          />
        )}
      </>
    );

    if (canManage) {
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

  if (!group) {
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

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <ScrollView
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
      >
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
              {t("screens:manageGroup.members")} ({members.length})
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
              {group?.subGroups?.length || 0})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "members" ? (
          <FlatList
            data={members}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.userId}
            style={styles.membersList}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            data={subgroups}
            renderItem={renderSubgroupItem}
            keyExtractor={(item) => item.id}
            style={styles.subgroupsList}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ScrollView>

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
                groupName: group?.name || "",
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
              groupName: group?.name,
              clubIdValue: clubId as string,
              clubNameValue: clubName as string,
            });

            router.push({
              pathname: "/create-event" as any,
              params: {
                clubId: clubId as string,
                clubName: clubName as string,
                groupId: groupId as string,
                groupName: group?.name || "",
                sourceScreen: "manage-group",
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
          groupId={groupId as string}
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
