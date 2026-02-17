import Button from "@/components/Button";
import FloatingActionButton from "@/components/FloatingActionButton";
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
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from "react";
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

// Import new services
import { fetchGroupMembers } from "@/services/fetchGroupMembers";
import { groupService } from "@/services/group";
import { permissionService } from "@/services/permissions";
import { SubGroup } from "@/services/subgroup";
import { GroupData, GroupMemberData } from "@/services/types/group";

export default function ManageGroupScreen() {
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
        groupService.getGroup(clubId, groupId),
        fetchGroupMembers(clubId, groupId),
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

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

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

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
    return (
      <View style={styles.memberItem}>
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
          <Text style={styles.loadingText}>Loading group data...</Text>
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Group not found</Text>
          <Button
            label="Go Back"
            onPress={() => router.back()}
            theme="secondary"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
              Members ({members.length})
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
              Subgroups ({group?.subGroups?.length || 0})
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

      {/* Floating Action Button for Create Event */}
      {canManage && (
        <FloatingActionButton
          onPress={() => {
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
              },
            });
          }}
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
