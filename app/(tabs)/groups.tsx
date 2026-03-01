//import AdContainer from "@/components/AdContainer";
import { theme } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function GroupsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { userProfile, isLoading, refreshUserProfile } = useUser();

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

  // Manual refresh function for pull-to-refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      console.log("🔄 Manual refresh triggered");
      await refreshUserProfile();
      // Dependent access is now stored in userProfile.dependents[].clubAccess
      // No need to fetch separately
    } catch (error) {
      console.error("❌ Error during manual refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{t("screens:groups.loadingGroups")}</Text>
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
