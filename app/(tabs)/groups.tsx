//import AdContainer from "@/components/AdContainer";
import { theme } from "@/constants/theme";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useUser } from "@/contexts/UserContext";
import { canManageGroup } from "@/utils/permissionHelpers";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function GroupsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { userProfile, isLoading } = useUser();
  const { getGroup } = useGroupData();

  // Extract clubs and groups from userProfile
  const clubs = userProfile?.clubAccess || [];

  // Enhanced group type with membership context
  interface EnhancedGroup {
    clubId: string;
    clubName: string;
    groupId: string;
    groupName: string;
    roles: string[];
    joinedAt: Date;
    lastModifiedAt: Date;
    membershipType: "direct" | "dependent"; // Badge distinction
    dependentName?: string; // For dependent groups
    dependentUid?: string; // For dependent groups
  }

  const userGroups = React.useMemo(() => {
    if (!userProfile?.clubAccess) return [];

    const allGroups: EnhancedGroup[] = [];

    // Add direct groups (user's own memberships) - filter out inactive
    for (const clubAccess of userProfile.clubAccess) {
      // Skip inactive clubs
      if (clubAccess.isActive === false) continue;

      if (clubAccess.groupAccess) {
        for (const groupAccess of clubAccess.groupAccess) {
          // Skip inactive groups
          if (groupAccess.isActive === false) continue;

          allGroups.push({
            clubId: clubAccess.clubId,
            clubName: clubAccess.clubName,
            groupId: groupAccess.groupId,
            groupName: groupAccess.groupName,
            roles: groupAccess.roles,
            joinedAt: groupAccess.joinedAt,
            lastModifiedAt: groupAccess.lastModifiedAt,
            membershipType: "direct",
          });
        }
      }
    }

    // Add dependent groups (children's memberships) - filter out inactive
    const dependents = userProfile.dependents || [];
    for (const dependent of dependents) {
      if (dependent.clubAccess) {
        for (const clubAccess of dependent.clubAccess) {
          // Skip inactive clubs
          if (clubAccess.isActive === false) continue;

          if (clubAccess.groupAccess) {
            for (const groupAccess of clubAccess.groupAccess) {
              // Skip inactive groups
              if (groupAccess.isActive === false) continue;

              allGroups.push({
                clubId: clubAccess.clubId,
                clubName: clubAccess.clubName,
                groupId: groupAccess.groupId,
                groupName: groupAccess.groupName,
                roles: groupAccess.roles,
                joinedAt: groupAccess.joinedAt,
                lastModifiedAt: groupAccess.lastModifiedAt,
                membershipType: "dependent",
                dependentName: dependent.childName,
                dependentUid: dependent.uid,
              });
            }
          }
        }
      }
    }

    return allGroups;
  }, [userProfile?.clubAccess, userProfile?.dependents]);

  // Group pictures derived from GroupDataContext (real-time listener data)
  const groupPictures = React.useMemo(() => {
    const pictures: Record<string, string | null> = {};
    for (const group of userGroups) {
      if (!(group.groupId in pictures)) {
        const groupData = getGroup(group.clubId, group.groupId);
        pictures[group.groupId] = groupData?.pictureUrl || null;
      }
    }
    return pictures;
  }, [userGroups, getGroup]);

  console.log("📱 GroupsScreen render - DETAILED DEBUG:", {
    isLoading,
    hasUserProfile: !!userProfile,
    userProfile_uid: userProfile?.uid,
    userProfile_email: userProfile?.email,
    clubAccess_raw: userProfile?.clubAccess,
    clubAccess_length: userProfile?.clubAccess?.length || 0,
    dependents_count: userProfile?.dependents?.length || 0,
    dependents_with_clubAccess:
      userProfile?.dependents?.filter(
        (d) => d.clubAccess && d.clubAccess.length > 0,
      ).length || 0,
    clubsCount: clubs.length,
    userGroupsCount: userGroups.length,
    directGroupsCount: userGroups.filter((g) => g.membershipType === "direct")
      .length,
    dependentGroupsCount: userGroups.filter(
      (g) => g.membershipType === "dependent",
    ).length,
    clubs: clubs.map((c) => ({
      clubId: c.clubId,
      clubName: c.clubName,
      role: c.role,
      groupAccess_length: c.groupAccess?.length || 0,
    })),
    userGroups: userGroups.map((g) => ({
      groupId: g.groupId,
      groupName: g.groupName,
      clubId: g.clubId,
      roles: g.roles,
      membershipType: g.membershipType,
      dependentName: g.dependentName,
    })),
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data is kept current by real-time listeners — pull-to-refresh is visual only.
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleGroupPress = (
    groupId: string,
    clubId: string,
    clubName: string,
  ) => {
    router.push(
      `/manage-group?groupId=${groupId}&clubId=${clubId}&clubName=${encodeURIComponent(clubName)}`,
    );
  };

  // Determine if user can edit a specific group (club-admin or group admin/coach)
  const canEditGroup = (clubId: string, groupId: string): boolean => {
    return canManageGroup(userProfile, clubId, groupId);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>
          {t("screens:groups.loadingGroups")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.groupsContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.secondary]}
            tintColor={theme.colors.secondary}
          />
        }
      >
        {userGroups.length === 0 ? (
          <Text style={styles.noGroupsText}>
            {t("screens:groups.noGroupsMessage")}
          </Text>
        ) : (
          userGroups.map((group) => (
            <TouchableOpacity
              key={`${group.groupId}-${group.dependentUid || "direct"}`}
              style={[
                styles.groupCard,
                group.membershipType === "dependent" &&
                  styles.dependentGroupCard,
              ]}
              onPress={() =>
                handleGroupPress(group.groupId, group.clubId, group.clubName)
              }
            >
              <View style={styles.groupHeader}>
                <View style={styles.groupIcon}>
                  {groupPictures[group.groupId] ? (
                    <Image
                      source={{ uri: groupPictures[group.groupId]! }}
                      style={styles.groupPictureImage}
                    />
                  ) : (
                    <Ionicons
                      name="people"
                      size={24}
                      color={theme.colors.secondary}
                    />
                  )}
                </View>
                <View style={styles.groupTitleContainer}>
                  <Text style={styles.groupName}>
                    {group.groupName || `Group ${group.groupId.slice(-4)}`}
                  </Text>
                  <Text style={styles.clubNameInGroup}>{group.clubName}</Text>
                  {group.membershipType === "dependent" && (
                    <View style={styles.dependentBadge}>
                      <Text style={styles.badgeText}>
                        👶 {group.dependentName}
                      </Text>
                    </View>
                  )}
                  {group.membershipType === "direct" && (
                    <View style={styles.directBadge}>
                      <Text style={styles.badgeText}>👤 You</Text>
                    </View>
                  )}
                </View>
                {/* Info icon for all users */}
                <TouchableOpacity
                  style={styles.infoIconButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    const editMode = canEditGroup(group.clubId, group.groupId)
                      ? "edit"
                      : "view";
                    router.push(
                      `/group-info?clubId=${group.clubId}&groupId=${group.groupId}&mode=${editMode}`,
                    );
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.groupRole}>
                Role: {group.roles.join(", ")}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.layout.containerPadding,
  },
  groupsContainer: {
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  groupCard: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.secondary,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  dependentGroupCard: {
    borderLeftColor: theme.colors.badge.child, // Different color for dependent groups
    backgroundColor: theme.colors.inputBackground,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.sm,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.sm,
  },
  groupPictureImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  infoIconButton: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  groupTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  groupName: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
  },
  clubNameInGroup: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  directBadge: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.small,
  },
  dependentBadge: {
    backgroundColor: theme.colors.badge.child,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.small,
  },
  badgeText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  groupRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.normal,
  },
  noGroupsText: {
    textAlign: "center",
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.medium,
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  loadingText: {
    textAlign: "center",
    marginTop: theme.spacing.lg,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.medium,
  },
});
