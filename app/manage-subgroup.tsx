import Button from "@/components/Button";
import { NewsEventFAB } from "@/components/FloatingActionButton";
import HierarchyBreadcrumb from "@/components/HierarchyBreadcrumb";
import MemberContactModal from "@/components/MemberContactModal";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useUser } from "@/contexts/UserContext";
import { useTrackFeatureOnMount } from "@/hooks/useOnboardingFeatureTracker";
import { GroupMemberData } from "@/services/types/group";
import {
    canManageGroup,
    isClubAdmin,
    isGroupMember,
} from "@/utils/permissionHelpers";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useLayoutEffect, useMemo, useState } from "react";
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

export default function ManageSubgroupScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const { groupId, subgroupId, clubId, subgroupName } = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  useTrackFeatureOnMount("subgroup-viewed");
  const { getGroup, getSubgroupMembers: getSubgroupMembersFromCtx } =
    useGroupData();
  const navigation = useNavigation();

  // Derive data from real-time context
  const group = getGroup(clubId as string, groupId as string);
  const subgroupMembers = getSubgroupMembersFromCtx(
    clubId as string,
    groupId as string,
    subgroupId as string,
  ).filter((m) => m.isActive !== false);

  // Derive permission from userProfile (sync)
  const canManage = useMemo(
    () => canManageGroup(userProfile, clubId as string, groupId as string),
    [userProfile, clubId, groupId],
  );

  const isClubAdminUser = useMemo(
    () => isClubAdmin(userProfile, clubId as string),
    [userProfile, clubId],
  );

  const isMember = useMemo(
    () => isGroupMember(userProfile, clubId as string, groupId as string),
    [userProfile, clubId, groupId],
  );

  const loading = !group;
  const [selectedMember, setSelectedMember] = useState<GroupMemberData | null>(
    null,
  );
  const [showMemberModal, setShowMemberModal] = useState(false);

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

  const handleMemberPress = (member: GroupMemberData) => {
    if (canManage || isMember) {
      setSelectedMember(member);
      setShowMemberModal(true);
    }
  };

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
    const canTap = canManage || isMember;
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

  const breadcrumbSegments = [
    {
      iconName: "trophy-outline" as const,
      label: group.clubName || "Club",
      isCurrent: false,
      onPress: isClubAdminUser
        ? () => router.push(`/manage-club?clubId=${clubId}` as any)
        : undefined,
    },
    {
      iconName: "people-outline" as const,
      label: group.name || "Group",
      isCurrent: false,
      onPress: canManage
        ? () =>
            router.push(
              `/manage-group?groupId=${groupId}&clubId=${clubId}&clubName=${encodeURIComponent(group.clubName || "")}` as any,
            )
        : undefined,
    },
    {
      iconName: "git-branch-outline" as const,
      label: displaySubgroupName,
      isCurrent: true,
    },
  ];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <FlatList
        data={subgroupMembers}
        renderItem={renderMemberItem}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={
          <>
            <HierarchyBreadcrumb segments={breadcrumbSegments} />
            <Text style={styles.sectionTitle}>
              {t("screens:manageSubgroup.members")} ({subgroupMembers.length})
            </Text>
          </>
        }
        ListEmptyComponent={
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
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      />

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
          isAdminViewing={canManage}
          isPeerViewing={!canManage && isMember}
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
