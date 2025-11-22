//import AdContainer from "@/components/AdContainer";
import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { useUserProfile } from "@/contexts/UserContext";
import { router } from "expo-router";
import React, { useState } from "react";
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function GroupsScreen() {
const { userProfile, isLoading } = useUserProfile();

// Extract clubs and groups from userProfile
const clubs = userProfile?.clubAccess || [];

const userGroups = React.useMemo(() => {
  if (!userProfile?.clubAccess) return [];
  
  const allGroups = [];
  for (const clubAccess of userProfile.clubAccess) {
    if (clubAccess.groupAccess) {
      for (const groupAccess of clubAccess.groupAccess) {
        allGroups.push({
          clubId: clubAccess.clubId,
          groupId: groupAccess.groupId,
          groupName: groupAccess.groupName,
          roles: groupAccess.roles,
          joinedAt: groupAccess.joinedAt,
          lastModifiedAt: groupAccess.lastModifiedAt,
          groupData: null, // Will be fetched separately when needed
        });
      }
    }
  }
  return allGroups;
}, [userProfile?.clubAccess]);

console.log('📱 GroupsScreen render:', {
  isLoading,
  clubsCount: clubs.length,
  userGroupsCount: userGroups.length,
  clubs: clubs.map(c => ({ clubId: c.clubId, clubName: c.clubName, role: c.role })),
  userGroups: userGroups.map(g => ({ 
    groupId: g.groupId, 
    groupName: g.groupName,
    clubId: g.clubId, 
    roles: g.roles,
    hasGroupData: !!g.groupData
  }))
});
const [selectedClub, setSelectedClub] = useState<string | null>(null);
const [isRefreshing, setIsRefreshing] = useState(false);

// Helper function to get groups for a specific club from user groups
const getGroupsForClub = (clubId: string) => {
  return userGroups.filter(group => group.clubId === clubId);
};

const handleCreateGroup = () => {
  router.push("/create-group");
};

const handleGroupPress = (groupId: string, clubId: string) => {
  router.push(`/manage-group?groupId=${groupId}&clubId=${clubId}`);
};

const handleRefresh = async () => {
  setIsRefreshing(true);
  try {
    // Since we removed complex versioning, just refresh the user profile
    // Other documents (clubs, groups) are now read directly from Firestore when needed
    console.log('✅ Refreshed user data');
  } catch (error) {
    console.error('❌ Error refreshing data:', error);
  } finally {
    setIsRefreshing(false);
  }
};

if (isLoading) {
return (
<SafeAreaView style={styles.container}>
<Text style={styles.loadingText}>Loading clubs and groups...</Text>
</SafeAreaView>
);
}

return (
<SafeAreaView style={styles.container}>
<View style={styles.header}>
<Text style={styles.title}>Groups</Text>
<Text style={styles.subtitle}>Manage your clubs and groups</Text>
</View>

  <View style={styles.buttonContainer}>
    <Button
      label="Create New Group / Club"
      theme="primary"
      onPress={handleCreateGroup}
    />
    <TouchableOpacity 
      style={[styles.refreshButton, { opacity: isRefreshing ? 0.7 : 1 }]}
      onPress={handleRefresh}
      disabled={isRefreshing}
    >
      <Text style={styles.refreshButtonText}>
        {isRefreshing ? "Refreshing..." : "🔄 Refresh Data"}
      </Text>
    </TouchableOpacity>
  </View>

  <ScrollView contentContainerStyle={styles.clubsContainer}>
    {clubs.length === 0 ? (
      <Text style={styles.noClubsText}>
        You haven&apos;t joined any clubs yet. Create your groups and
        organize your sport activities!
      </Text>
    ) : (
      clubs.map((club) => {
        const clubGroups = getGroupsForClub(club.clubId);
        const isSelected = selectedClub === club.clubId;
        
        return (
          <View key={club.clubId} style={styles.clubSection}>
            <TouchableOpacity
              style={[
                styles.clubCard,
                isSelected && styles.clubCardSelected,
              ]}
              onPress={() => setSelectedClub(isSelected ? null : club.clubId)}
            >
              <View style={styles.clubHeader}>
                <Text
                  style={[
                    styles.clubName,
                    isSelected && styles.clubNameSelected,
                  ]}
                >
                  {club.clubName}
                </Text>
                <Text style={styles.groupCount}>
                  {clubGroups.length} group{clubGroups.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </TouchableOpacity>
            
            {/* Show groups when club is selected */}
            {isSelected && clubGroups.length > 0 && (
              <View style={styles.groupsContainer}>
                {clubGroups.map((group) => {
                  console.log('🔍 Rendering group:', { 
                    groupId: group.groupId, 
                    groupName: group.groupName,
                    roles: group.roles 
                  });
                  
                  return (
                    <TouchableOpacity 
                      key={group.groupId}
                      style={styles.groupCard}
                      onPress={() => handleGroupPress(group.groupId, club.clubId)}
                    >
                      <Text style={styles.groupName}>
                        {group.groupName || `Group ${group.groupId.slice(-4)}`}
                      </Text>
                      <Text style={styles.groupRole}>
                        Role: {group.roles.join(', ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            
            {/* Show message when club is selected but has no groups */}
            {isSelected && clubGroups.length === 0 && (
              <View style={styles.noGroupsContainer}>
                <Text style={styles.noGroupsText}>
                  No groups in this club yet. Create your first group!
                </Text>
              </View>
            )}
          </View>
        );
      })
    )}
  </ScrollView>

</SafeAreaView>


);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.layout.containerPadding,
  },
  header: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  buttonContainer: {
    marginVertical: theme.spacing.lg,
  },
  clubsContainer: {
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  clubSection: {
    marginBottom: theme.spacing.md,
  },
  clubCard: {
    backgroundColor: theme.colors.secondary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
  },
  clubCardSelected: {
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
  },
  clubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clubName: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: theme.typography.fontSize.medium,
    flex: 1,
  },
  clubNameSelected: {
    color: theme.colors.primary,
  },
  groupCount: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.small,
    opacity: 0.8,
  },
  groupsContainer: {
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
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
  groupName: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  groupRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.normal,
  },
  noGroupsContainer: {
    marginTop: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  noGroupsText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    fontStyle: "italic",
    textAlign: "center",
  },
  noClubsText: {
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
  refreshButton: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
  },
});