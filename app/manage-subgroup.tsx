import Button from "@/components/Button";
import { NewsEventFAB } from "@/components/FloatingActionButton";
import MemberContactModal from "@/components/MemberContactModal";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useDataCache } from "@/contexts/DataCacheContext";
import { fetchGroupMembers } from "@/services/fetchGroupMembers";
import { groupService } from "@/services/group";
import { subgroupService } from "@/services/subgroup";
import { GroupData, GroupMemberData } from "@/services/types/group";
import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useLayoutEffect, useState } from "react";
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

export default function ManageSubgroupScreen() {
  const cache = useDataCache();
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const { groupId, subgroupId, clubId, subgroupName } = useLocalSearchParams();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [subgroupMembers, setSubgroupMembers] = useState<GroupMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [selectedMember, setSelectedMember] = useState<GroupMemberData | null>(
    null,
  );
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Check if user can manage subgroup (inherits from group permissions)
  const canManage =
    user &&
    group &&
    (group.createdBy === user.uid ||
      userRoles.includes("club-admin") ||
      userRoles.includes("admin") ||
      userRoles.includes("coach"));

  const displaySubgroupName =
    typeof subgroupName === "string" ? subgroupName : "Subgroup";

  // Set dynamic header with settings button
  useLayoutEffect(() => {
    navigation.setOptions({
      title: displaySubgroupName || "Manage Subgroup",
      headerRight: () =>
        canManage ? (
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/subgroup-settings?groupId=${groupId}&clubId=${clubId}&subgroupId=${subgroupId}&subgroupName=${encodeURIComponent(displaySubgroupName)}` as any,
              )
            }
            style={{ marginRight: 8 }}
          >
            <Ionicons
              name="settings-outline"
              size={24}
              color={theme.colors.secondary}
            />
          </TouchableOpacity>
        ) : null,
    });
  }, [displaySubgroupName, canManage, navigation, groupId, clubId, subgroupId]);

  const fetchData = useCallback(async () => {
    if (
      !groupId ||
      !clubId ||
      !subgroupId ||
      typeof groupId !== "string" ||
      typeof clubId !== "string" ||
      typeof subgroupId !== "string"
    )
      return;

    try {
      // Fetch group and subgroup members
      const [groupResult, membersResult, subgroupMembersResult] =
        await Promise.all([
          groupService.getGroup(clubId, groupId, cache),
          fetchGroupMembers(clubId, groupId, cache),
          subgroupService.getSubgroupMembers(clubId, groupId, subgroupId),
        ]);

      // Process group data
      if (groupResult.success && groupResult.data) {
        setGroup(groupResult.data);
      }

      // Process members data for role checking
      const membersData: GroupMemberData[] = membersResult.success
        ? membersResult.members
        : [];

      // Process subgroup members data
      const subgroupMembersData: GroupMemberData[] =
        subgroupMembersResult.success ? subgroupMembersResult.members : [];
      console.log(
        `📋 Fetched ${subgroupMembersData.length} members for subgroup ${subgroupId}`,
      );
      setSubgroupMembers(subgroupMembersData);

      // Get current user's roles
      if (user && membersData) {
        const currentUserMember = membersData.find(
          (member: any) => member.userId === user.uid,
        );
        setUserRoles(currentUserMember?.roles || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, subgroupId, user]);

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
    await fetchData();
    setRefreshing(false);
  }, [clubId, groupId, cache, fetchData]);

  // Removed useEffect double-fetch. Only useFocusEffect remains.

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

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

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:manageSubgroup.loadingSubgroup")}
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
            {t("screens:manageSubgroup.subgroupNotFound")}
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
        {/* Members Section */}
        <Text style={styles.sectionTitle}>
          {t("screens:manageSubgroup.members")} ({subgroupMembers.length})
        </Text>

        {subgroupMembers.length > 0 ? (
          <FlatList
            data={subgroupMembers}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.userId}
            scrollEnabled={false}
            style={styles.membersList}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {t("screens:manageSubgroup.noMembersInSubgroup")}
            </Text>
            {canManage && (
              <Text style={styles.emptySubtext}>
                {t("screens:manageSubgroup.manageMembersHint")}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB: Create Subgroup News or Event */}
      {canManage && (
        <NewsEventFAB
          onNewsPress={() => {
            router.push({
              pathname: "/create-news" as any,
              params: {
                clubId: clubId as string,
                clubName: group.clubName || "",
                groupId: groupId as string,
                groupName: group.name || "",
                subgroupId: subgroupId as string,
                subgroupName: displaySubgroupName,
                sourceScreen: "manage-subgroup",
              },
            });
          }}
          onEventPress={() => {
            router.push({
              pathname: "/create-event" as any,
              params: {
                clubId: clubId as string,
                clubName: group.clubName || "",
                groupId: groupId as string,
                groupName: group.name || "",
                subgroupId: subgroupId as string,
                subgroupName: displaySubgroupName,
                sourceScreen: "manage-subgroup",
                memberCount: subgroupMembers.length,
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.sm,
  },
  backButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
  },
  groupTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  subgroupTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  kebabButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  kebabMenu: {
    position: "absolute",
    top: 60,
    right: theme.layout.containerPadding,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
    minWidth: 200,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  menuText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  settingsButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.md,
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
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
});
