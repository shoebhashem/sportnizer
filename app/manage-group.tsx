import Button from "@/components/Button";
import { NewsEventFAB } from "@/components/FloatingActionButton";
import MemberContactModal from "@/components/MemberContactModal";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useUser } from "@/contexts/UserContext";
import { SubGroup } from "@/services/subgroup";
import { GroupMemberData } from "@/services/types/group";
import { canManageGroup } from "@/utils/permissionHelpers";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useLayoutEffect, useMemo, useState } from "react";
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

export default function ManageGroupScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const { groupId, clubId, clubName, tab } = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const {
    getGroup,
    getGroupMembers,
    getSubgroups: getSubgroupsFromCtx,
  } = useGroupData();
  const navigation = useNavigation();

  // Derive data from real-time context
  const group = getGroup(clubId as string, groupId as string);
  const contextMembers = getGroupMembers(clubId as string, groupId as string);
  const contextSubgroups = getSubgroupsFromCtx(
    clubId as string,
    groupId as string,
  );

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

  // Check if user is a guardian of a specific member
  const isGuardianOf = useMemo(() => {
    const dependentUids = new Set(
      (userProfile?.dependents || []).map((d) => d.uid),
    );
    return (memberId: string) => dependentUids.has(memberId);
  }, [userProfile?.dependents]);

  const loading = !group && !contextMembers.length;

  const [activeTab, setActiveTab] = useState<"members" | "subgroups">(
    tab === "subgroups" ? "subgroups" : "members",
  );
  const [selectedMember, setSelectedMember] = useState<GroupMemberData | null>(
    null,
  );
  const [showMemberModal, setShowMemberModal] = useState(false);

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
    if (canManage || isGuardianOf(member.userId)) {
      setSelectedMember(member);
      setShowMemberModal(true);
    }
  };

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
    const canTap = canManage || isGuardianOf(item.userId);
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
              {t("screens:manageGroup.members")} ({contextMembers.length})
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
            data={contextMembers}
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
                memberCount: contextMembers.length,
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
