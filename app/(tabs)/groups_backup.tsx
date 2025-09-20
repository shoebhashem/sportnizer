import Button from '@/components/Button';
import CreateGroupModal from '@/components/CreateGroupModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/contexts/UserContext';
import { router, useFocusEffect } from 'expo-router';
import { collection, collectionGroup, doc, getDoc, getDocs, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserAccessibleClubsAndGroups, ClubWithGroups as ServiceClubWithGroups } from '../../services/userGroupService';

export default function GroupsScreen() {
  const { user } = useAuth();
  const { userProfile } = useUser();
  const [clubsWithGroups, setClubsWithGroups] = useState<ServiceClubWithGroups[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch clubs with their groups and member statistics
  const fetchClubsAndGroups = useCallback(async () => {
    if (!user || !userProfile) return;

    setLoading(true);
    try {
      const db = getFirestore();
      const clubsData: ClubWithGroups[] = [];
      
      // Get groups from clubs where user is a member
      if (userProfile.clubs && userProfile.clubs.length > 0) {
        for (const clubMembership of userProfile.clubs) {
          try {
            // Get club details
            const clubDocRef = doc(db, 'clubs', clubMembership.clubId);
            const clubDoc = await getDoc(clubDocRef);
            
            if (!clubDoc.exists()) {
              console.warn(`Club ${clubMembership.clubId} not found`);
              continue;
            }
            
            const clubData = clubDoc.data();
            const clubGroups: Group[] = [];
            
            // Get all groups in this club
            const groupsQuery = query(collection(db, 'clubs', clubMembership.clubId, 'groups'));
            const groupsSnapshot = await getDocs(groupsQuery);
            
            for (const groupDoc of groupsSnapshot.docs) {
              const groupData = groupDoc.data();
              
              // Get member statistics for this group
              const membersQuery = query(collection(db, 'clubs', clubMembership.clubId, 'groups', groupDoc.id, 'members'));
              const membersSnapshot = await getDocs(membersQuery);
              
              let memberCount = 0;
              let coachCount = 0;
              let adminCount = 0;
              
              membersSnapshot.forEach((memberDoc) => {
                const memberData = memberDoc.data();
                const roles = memberData.roles || [];
                
                memberCount++;
                if (roles.includes('coach')) coachCount++;
                if (roles.includes('admin')) adminCount++;
              });
              
              clubGroups.push({
                id: groupDoc.id,
                name: groupData.name,
                clubId: clubMembership.clubId,
                clubName: clubData.name,
                sportType: groupData.sportType,
                isActive: groupData.isActive,
                memberCount,
                coachCount,
                adminCount
              });
            }
            
            clubsData.push({
              id: clubMembership.clubId,
              name: clubData.name,
              isAdmin: clubMembership.isAdmin,
              groups: clubGroups
            });
            
          } catch (error) {
            console.error(`Error fetching data for club ${clubMembership.clubId}:`, error);
          }
        }
      }
      
      // Also get groups where user is directly mentioned as creator (fallback for any orphaned groups)
      try {
        const allGroupsQuery = query(
          collectionGroup(db, 'groups'),
          where('createdBy', '==', user.uid)
        );
        const allGroupsSnapshot = await getDocs(allGroupsQuery);
        
        for (const groupDoc of allGroupsSnapshot.docs) {
          const groupData = groupDoc.data();
          
          // Check if this group is already included in a club
          const isAlreadyIncluded = clubsData.some(club => 
            club.groups.some(group => group.id === groupDoc.id)
          );
          
          if (!isAlreadyIncluded) {
            // Get club details for this orphaned group
            const clubDocRef = doc(db, 'clubs', groupData.clubId);
            const clubDoc = await getDoc(clubDocRef);
            
            if (clubDoc.exists()) {
              const clubData = clubDoc.data();
              
              // Get member statistics
              const membersQuery = query(collection(db, 'clubs', groupData.clubId, 'groups', groupDoc.id, 'members'));
              const membersSnapshot = await getDocs(membersQuery);
              
              let memberCount = 0;
              let coachCount = 0;
              let adminCount = 0;
              
              membersSnapshot.forEach((memberDoc) => {
                const memberData = memberDoc.data();
                const roles = memberData.roles || [];
                
                memberCount++;
                if (roles.includes('coach')) coachCount++;
                if (roles.includes('admin')) adminCount++;
              });
              
              const orphanedGroup: Group = {
                id: groupDoc.id,
                name: groupData.name,
                clubId: groupData.clubId,
                clubName: clubData.name,
                sportType: groupData.sportType,
                isActive: groupData.isActive,
                memberCount,
                coachCount,
                adminCount
              };
              
              // Find existing club or create new entry
              const existingClubIndex = clubsData.findIndex(club => club.id === groupData.clubId);
              if (existingClubIndex >= 0) {
                clubsData[existingClubIndex].groups.push(orphanedGroup);
              } else {
                clubsData.push({
                  id: groupData.clubId,
                  name: clubData.name,
                  isAdmin: false, // User might not be admin of this club
                  groups: [orphanedGroup]
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching created groups:', error);
      }

      console.log('Total clubs found:', clubsData.length);
      console.log('Clubs data:', clubsData);
      setClubsWithGroups(clubsData);
      
      // Auto-select first club if none selected
      if (clubsData.length > 0 && !selectedClubId) {
        setSelectedClubId(clubsData[0].id);
      }
      
    } catch (error) {
      console.error('Error fetching clubs and groups:', error);
    } finally {
      setLoading(false);
    }
  }, [user, userProfile, selectedClubId]);

  // Initial data fetch
  useEffect(() => {
    fetchClubsAndGroups();
  }, [fetchClubsAndGroups]);

  // Real-time listener for user's groups based on club memberships
  useEffect(() => {
    if (!user || !userProfile) return;

    const db = getFirestore();
    const unsubscribers: (() => void)[] = [];

    const setupListeners = async () => {
      // Listen to changes in each club's groups where user is a member
      if (userProfile.clubs && userProfile.clubs.length > 0) {
        for (const clubMembership of userProfile.clubs) {
          try {
            const groupsQuery = query(collection(db, 'clubs', clubMembership.clubId, 'groups'));
            
            const unsubscribe = onSnapshot(groupsQuery, async (snapshot) => {
              // Refetch all clubs and groups when any group changes
              await fetchClubsAndGroups();
            });
            
            unsubscribers.push(unsubscribe);
          } catch (error) {
            console.error(`Error setting up listener for club ${clubMembership.clubId}:`, error);
          }
        }
      }
      
      // Also listen to any groups where user is creator (using collectionGroup)
      try {
        const allGroupsQuery = query(
          collectionGroup(db, 'groups'),
          where('createdBy', '==', user.uid)
        );
        
        const unsubscribe = onSnapshot(allGroupsQuery, async (snapshot) => {
          // Refetch all clubs and groups when created groups change
          await fetchClubsAndGroups();
        });
        
        unsubscribers.push(unsubscribe);
      } catch (error) {
        console.error('Error setting up created groups listener:', error);
      }
    };

    setupListeners();

    // Cleanup function
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [user, userProfile, fetchClubsAndGroups]);

  // Refresh data when screen comes into focus (e.g., after creating/deleting groups)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchClubsAndGroups();
      }
    }, [user, fetchClubsAndGroups])
  );

  const handleCreateGroup = () => {
    setShowCreateModal(true);
  };

  const handleCreateGroupSuccess = (result: { clubId?: string; groupId: string }) => {
    console.log('Group created successfully:', result);
    setShowCreateModal(false);
    // Refresh the clubs and groups data
    if (user) {
      fetchClubsAndGroups();
    }
    // Navigate to the new group
    router.push(`/manage-group?groupId=${result.groupId}` as any);
  };

  const handleGroupPress = (groupId: string) => {
    router.push(`/manage-group?groupId=${groupId}` as any);
  };

    // Get currently selected club data
  const selectedClub = clubsWithGroups.find(club => club.id === selectedClubId);
  const selectedGroups = selectedClub?.groups || [];

  const renderClubSelector = () => {
    if (clubsWithGroups.length === 0) return null;
    
    if (clubsWithGroups.length === 1) {
      // If only one club, show it as a title
      const club = clubsWithGroups[0];
      return (
        <View style={styles.singleClubContainer}>
          <Text style={styles.singleClubTitle}>{club.name}</Text>
          <Text style={styles.singleClubSubtitle}>
            {club.groups.length} {club.groups.length === 1 ? 'group' : 'groups'}
          </Text>
        </View>
      );
    }

    // Multiple clubs - show horizontal selector
    return (
      <View style={styles.clubSelectorContainer}>
        <Text style={styles.selectorTitle}>Select Club</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.clubScrollView}
          contentContainerStyle={styles.clubScrollContent}
        >
          {clubsWithGroups.map((club) => (
            <TouchableOpacity
              key={club.id}
              style={[
                styles.clubCard,
                selectedClubId === club.id && styles.clubCardSelected
              ]}
              onPress={() => setSelectedClubId(club.id)}
            >
              <Text style={[
                styles.clubCardName,
                selectedClubId === club.id && styles.clubCardNameSelected
              ]}>
                {club.name}
              </Text>
              <Text style={[
                styles.clubCardMeta,
                selectedClubId === club.id && styles.clubCardMetaSelected
              ]}>
                {club.groups.length} {club.groups.length === 1 ? 'group' : 'groups'}
              </Text>
              {club.isAdmin && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderGroupCard = ({ item }: { item: Group }) => (
    <TouchableOpacity 
      style={styles.groupCard}
      onPress={() => handleGroupPress(item.id)}
    >
      <View style={styles.groupCardHeader}>
        <Text style={styles.groupCardName}>{item.name}</Text>
        <Text style={styles.groupCardSport}>{item.sportType || 'Unknown Sport'}</Text>
      </View>
      
      <View style={styles.groupCardStats}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{item.memberCount || 0}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{item.coachCount || 0}</Text>
          <Text style={styles.statLabel}>Coaches</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{item.adminCount || 0}</Text>
          <Text style={styles.statLabel}>Admins</Text>
        </View>
      </View>
      
      <View style={styles.groupCardFooter}>
        <Text style={styles.groupCardArrow}>View Details ›</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No Groups Yet</Text>
      <Text style={styles.emptyText}>
        {selectedClub 
          ? `No groups found in ${selectedClub.name}. Create your first group to get started!`
          : 'Join a club or create your first group to get started!'
        }
      </Text>
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading your clubs and groups...</Text>
        </View>
      );
    }

    if (clubsWithGroups.length === 0) {
      return (
        <View style={styles.content}>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Welcome to Groups!</Text>
            <Text style={styles.emptyText}>
              Create your first group or join a group by invitation link.
            </Text>
          </View>
          <View style={styles.buttonContainer}>
            <Button
              label="Create New Group"
              onPress={handleCreateGroup}
              theme="secondary"
            />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        {renderClubSelector()}
        
        <View style={styles.groupsSection}>
          <View style={styles.groupsSectionHeader}>
            <Text style={styles.groupsSectionTitle}>
              {selectedClub ? `Groups in ${selectedClub.name}` : 'Groups'}
            </Text>
            <TouchableOpacity 
              style={styles.createGroupButton}
              onPress={handleCreateGroup}
            >
              <Text style={styles.createGroupButtonText}>+ Add Group</Text>
            </TouchableOpacity>
          </View>
          
          {selectedGroups.length > 0 ? (
            <FlatList
              data={selectedGroups}
              renderItem={renderGroupCard}
              keyExtractor={(item) => item.id}
              style={styles.groupsList}
              contentContainerStyle={styles.groupsListContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            renderEmptyState()
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>

      <CreateGroupModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateGroupSuccess}
        userClubs={clubsWithGroups.map(club => ({
          id: club.id,
          name: club.name,
          isAdmin: club.isAdmin
        }))}
      />
    </SafeAreaView>
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
  content: {
    flex: 1,
    width: '100%',
  },
  buttonContainer: {
    width: '100%',
    marginBottom: theme.spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  // Single Club Container
  singleClubContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  singleClubTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
  },
  singleClubSubtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  // Club Selector Container
  clubSelectorContainer: {
    marginBottom: theme.spacing.lg,
  },
  selectorTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  clubScrollView: {
    flexGrow: 0,
  },
  clubScrollContent: {
    paddingHorizontal: theme.spacing.xs,
  },
  // Club Cards
  clubCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginRight: theme.spacing.sm,
    minWidth: 140,
    position: 'relative',
  },
  clubCardSelected: {
    backgroundColor: theme.colors.secondary,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
  },
  clubCardName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.spacing.xs,
  },
  clubCardNameSelected: {
    color: theme.colors.primary,
  },
  clubCardMeta: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  clubCardMetaSelected: {
    color: theme.colors.primary,
    opacity: 0.8,
  },
  adminBadge: {
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.small,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  adminBadgeText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  // Groups Section
  groupsSection: {
    flex: 1,
  },
  groupsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  groupsSectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
  },
  createGroupButton: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.small,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  createGroupButtonText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  groupsList: {
    flex: 1,
  },
  groupsListContent: {
    paddingBottom: theme.spacing.lg,
  },
  // Group Cards
  groupCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  groupCardHeader: {
    marginBottom: theme.spacing.sm,
  },
  groupCardName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  groupCardSport: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  groupCardStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.small,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  groupCardFooter: {
    alignItems: 'flex-end',
  },
  groupCardArrow: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  // Empty States
  emptyContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
