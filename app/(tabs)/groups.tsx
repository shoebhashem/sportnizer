//import AdContainer from "@/components/AdContainer";
import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";
import { router } from "expo-router";
import React, { useState } from "react";
import {
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function GroupsScreen() {
const { userProfile, isLoading, refreshUserProfile, clearUserData } = useUser();

// Extract clubs and groups from userProfile
const clubs = userProfile?.clubAccess || [];

// Enhanced group type with membership context
interface EnhancedGroup {
  clubId: string;
  groupId: string;
  groupName: string;
  roles: string[];
  joinedAt: Date;
  lastModifiedAt: Date;
  membershipType: 'direct' | 'dependent'; // Badge distinction
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
          groupId: groupAccess.groupId,
          groupName: groupAccess.groupName,
          roles: groupAccess.roles,
          joinedAt: groupAccess.joinedAt,
          lastModifiedAt: groupAccess.lastModifiedAt,
          membershipType: 'direct',
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
              groupId: groupAccess.groupId,
              groupName: groupAccess.groupName,
              roles: groupAccess.roles,
              joinedAt: groupAccess.joinedAt,
              lastModifiedAt: groupAccess.lastModifiedAt,
              membershipType: 'dependent',
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

console.log('📱 GroupsScreen render - DETAILED DEBUG:', {
  isLoading,
  hasUserProfile: !!userProfile,
  userProfile_uid: userProfile?.uid,
  userProfile_email: userProfile?.email,
  clubAccess_raw: userProfile?.clubAccess,
  clubAccess_length: userProfile?.clubAccess?.length || 0,
  dependents_count: userProfile?.dependents?.length || 0,
  dependents_with_clubAccess: userProfile?.dependents?.filter(d => d.clubAccess && d.clubAccess.length > 0).length || 0,
  clubsCount: clubs.length,
  userGroupsCount: userGroups.length,
  directGroupsCount: userGroups.filter(g => g.membershipType === 'direct').length,
  dependentGroupsCount: userGroups.filter(g => g.membershipType === 'dependent').length,
  clubs: clubs.map(c => ({ 
    clubId: c.clubId, 
    clubName: c.clubName, 
    role: c.role,
    groupAccess_length: c.groupAccess?.length || 0
  })),
  userGroups: userGroups.map(g => ({ 
    groupId: g.groupId, 
    groupName: g.groupName,
    clubId: g.clubId, 
    roles: g.roles,
    membershipType: g.membershipType,
    dependentName: g.dependentName
  }))
});
const [isRefreshing, setIsRefreshing] = useState(false);

// Manual refresh function for pull-to-refresh
const handleRefresh = async () => {
  setIsRefreshing(true);
  try {
    console.log('🔄 Manual refresh triggered');
    await refreshUserProfile();
    // Dependent access is now stored in userProfile.dependents[].clubAccess
    // No need to fetch separately
  } catch (error) {
    console.error('❌ Error during manual refresh:', error);
  } finally {
    setIsRefreshing(false);
  }
};

// Debug function to check data directly from Firestore
const handleDebugUserData = async () => {
  if (!userProfile?.uid) {
    console.log('❌ No user profile available');
    return;
  }
  
  console.log('🐛 === DETAILED DEBUG START ===');
  console.log('🐛 UserContext data:', {
    hasUserProfile: !!userProfile,
    uid: userProfile.uid,
    email: userProfile.email,
    clubAccess: userProfile.clubAccess,
    clubAccessLength: userProfile.clubAccess?.length || 0
  });
  
  // Import and use the service directly to bypass cache
  const { fetchUserProfile } = await import('@/services/fetchUserAccess');
  console.log('🐛 Fetching fresh data from Firestore...');
  
  const freshData = await fetchUserProfile(userProfile.uid);
  console.log('🐛 Fresh Firestore data:', {
    success: freshData.success,
    error: freshData.error,
    profile: freshData.profile,
    clubAccess: freshData.profile?.clubAccess,
    clubAccessLength: freshData.profile?.clubAccess?.length || 0
  });
  
  console.log('🐛 === DETAILED DEBUG END ===');
};

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

const handleClubPress = (clubId: string, clubRole: string) => {
  // Only club-admins can view club members
  if (clubRole === 'club-admin') {
    router.push(`/manage-club?clubId=${clubId}` as any);
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
    
    {/* Debug button - remove in production */}
    <TouchableOpacity
      style={styles.debugButton}
      onPress={handleDebugUserData}
    >
      <Text style={styles.debugText}>🔍 Debug User Data</Text>
    </TouchableOpacity>
    
    {/* Clear Cache button - remove in production */}
    <TouchableOpacity
      style={[styles.debugButton, { backgroundColor: theme.colors.error }]}
      onPress={async () => {
        console.log('🗑️ Clearing user cache...');
        await clearUserData();
        console.log('🔄 Cache cleared, refreshing...');
        await refreshUserProfile();
      }}
    >
      <Text style={styles.debugText}>🗑️ Clear Cache & Refresh</Text>
    </TouchableOpacity>
  </View>

  <ScrollView 
    contentContainerStyle={styles.clubsContainer}
    refreshControl={
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        colors={[theme.colors.secondary]}
        tintColor={theme.colors.secondary}
      />
    }
  >
    {clubs.length === 0 ? (
      <Text style={styles.noClubsText}>
        You haven&apos;t joined any clubs yet. Create your groups and
        organize your sport activities!
      </Text>
    ) : (
      clubs.map((club) => {
        const clubGroups = getGroupsForClub(club.clubId);
        const isClubAdmin = club.role === 'club-admin';
        
        return (
          <View key={club.clubId} style={styles.clubSection}>
            <TouchableOpacity
              style={[
                styles.clubCard,
                isClubAdmin && styles.clubCardClickable,
              ]}
              onPress={() => handleClubPress(club.clubId, club.role)}
              disabled={!isClubAdmin}
            >
              <View style={styles.clubHeader}>
                <Text
                  style={styles.clubName}
                >
                  {club.clubName}
                </Text>
                <Text style={styles.groupCount}>
                  {clubGroups.length} group{clubGroups.length !== 1 ? 's' : ''}
                </Text>
              </View>
              {isClubAdmin && (
                <Text style={styles.clubAdminHint}>Tap to view club members</Text>
              )}
            </TouchableOpacity>
            
            {/* Always show groups */}
            {clubGroups.length > 0 && (
              <View style={styles.groupsContainer}>
                {clubGroups.map((group) => {
                  console.log('🔍 Rendering group:', { 
                    groupId: group.groupId, 
                    groupName: group.groupName,
                    roles: group.roles,
                    membershipType: group.membershipType,
                    dependentName: group.dependentName
                  });
                  
                  return (
                    <TouchableOpacity 
                      key={`${group.groupId}-${group.dependentUid || 'direct'}`}
                      style={[
                        styles.groupCard,
                        group.membershipType === 'dependent' && styles.dependentGroupCard
                      ]}
                      onPress={() => handleGroupPress(group.groupId, club.clubId)}
                    >
                      <View style={styles.groupHeader}>
                        <View style={styles.groupTitleContainer}>
                          <Text style={styles.groupName}>
                            {group.groupName || `Group ${group.groupId.slice(-4)}`}
                          </Text>
                          <Text style={styles.clubNameInGroup}>
                            {club.clubName}
                          </Text>
                          {group.membershipType === 'dependent' && (
                            <View style={styles.dependentBadge}>
                              <Text style={styles.badgeText}>
                                👶 {group.dependentName}
                              </Text>
                            </View>
                          )}
                          {group.membershipType === 'direct' && (
                            <View style={styles.directBadge}>
                              <Text style={styles.badgeText}>
                                👤 You
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={styles.groupRole}>
                        Role: {group.roles.join(', ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            
            {/* Show message when club has no groups */}
            {clubGroups.length === 0 && (
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
  clubCardClickable: {
    backgroundColor: theme.colors.secondary,
    opacity: 0.95,
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
  clubAdminHint: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.small,
    opacity: 0.7,
    marginTop: theme.spacing.xs,
    fontStyle: 'italic',
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
  dependentGroupCard: {
    borderLeftColor: theme.colors.success, // Different color for dependent groups
    backgroundColor: theme.colors.inputBackground,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  groupTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
    backgroundColor: theme.colors.success,
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
  debugButton: {
    backgroundColor: theme.colors.error,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    marginTop: theme.spacing.sm,
  },
  debugText: {
    color: theme.colors.primary,
    textAlign: "center",
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
  },
});