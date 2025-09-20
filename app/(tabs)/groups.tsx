import Button from '@/components/Button';
import CreateGroupModal from '@/components/CreateGroupModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/contexts/UserContext';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClubWithGroups, getUserAccessibleClubsAndGroups, GroupWithDetails } from '../../services/userGroupService';

export default function GroupsScreen() {
  const { user } = useAuth();
  const { userProfile } = useUser();
  const [clubsWithGroups, setClubsWithGroups] = useState<ClubWithGroups[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch clubs with their groups using efficient permission-based service
  const fetchClubsAndGroups = useCallback(async () => {
    if (!user || !userProfile) return;

    setLoading(true);
    try {
      const result = await getUserAccessibleClubsAndGroups();
      
      if (result.success && result.data) {
        setClubsWithGroups(result.data);
        
        // Auto-select first club if only one club, otherwise clear selection
        if (result.data.length === 1) {
          setSelectedClubId(result.data[0].id);
        } else {
          setSelectedClubId(null);
        }
      } else {
        console.error('Error fetching clubs and groups:', result.error);
        setClubsWithGroups([]);
      }
    } catch (error) {
      console.error('Error in fetchClubsAndGroups:', error);
      setClubsWithGroups([]);
    } finally {
      setLoading(false);
    }
  }, [user, userProfile]);

  // Initial data fetch
  useEffect(() => {
    fetchClubsAndGroups();
  }, [fetchClubsAndGroups]);

  // Refresh when coming back to this screen
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchClubsAndGroups();
      }
    }, [user, fetchClubsAndGroups])
  );

  // Handle group creation success
  const handleGroupCreated = () => {
    setShowCreateModal(false);
    fetchClubsAndGroups();
  };

  // Filter groups for selected club
  const selectedClub = selectedClubId ? clubsWithGroups.find(club => club.id === selectedClubId) : null;
  const groupsToShow = selectedClub ? selectedClub.groups : [];

  // Render club selector card
  const renderClubCard = ({ item }: { item: ClubWithGroups }) => (
    <TouchableOpacity
      style={[
        styles.clubCard,
        selectedClubId === item.id && styles.selectedClubCard
      ]}
      onPress={() => setSelectedClubId(selectedClubId === item.id ? null : item.id)}
    >
      <View style={styles.clubHeader}>
        <Text style={[
          styles.clubName,
          selectedClubId === item.id && styles.selectedClubName
        ]}>
          {item.name}
        </Text>
        {item.isUserAdmin && (
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
        )}
      </View>
      <View style={styles.clubStats}>
        <Text style={styles.clubStatsText}>
          {item.groups.length} groups • {item.totalMembers} members
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Render group card
  const renderGroupCard = ({ item }: { item: GroupWithDetails }) => (
    <TouchableOpacity
      style={styles.groupCard}
      onPress={() => {
        // TODO: Navigate to group details page
        console.log('Navigate to group:', item.id);
      }}
    >
      <View style={styles.groupHeader}>
        <Text style={styles.groupName}>{item.name}</Text>
        <Text style={styles.groupSport}>{item.sportType}</Text>
      </View>
      
      <View style={styles.groupStats}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{item.membersCount}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
        
        {item.userRoles.length > 0 && (
          <View style={styles.rolesBadgeContainer}>
            {item.userRoles.map((role) => (
              <View 
                key={role} 
                style={[
                  styles.roleBadge,
                  role === 'admin' && styles.adminRoleBadge,
                  role === 'coach' && styles.coachRoleBadge,
                ]}
              >
                <Text style={[
                  styles.roleBadgeText,
                  role === 'admin' && styles.adminRoleText,
                  role === 'coach' && styles.coachRoleText,
                ]}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  // Render empty state for no clubs
  const renderEmptyClubs = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No Clubs Yet</Text>
      <Text style={styles.emptyDescription}>
        You&apos;re not a member of any clubs yet. Create a group to automatically create your first club.
      </Text>
      <Button
        label="Create Your First Group"
        onPress={() => setShowCreateModal(true)}
      />
    </View>
  );

  // Render empty state for no groups in selected club
  const renderEmptyGroups = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No Groups Yet</Text>
      <Text style={styles.emptyDescription}>
        {selectedClub?.isUserAdmin 
          ? "This club doesn't have any groups yet. Create the first one!"
          : "You don't have access to any groups in this club yet."
        }
      </Text>
      {selectedClub?.isUserAdmin && (
        <Button
          label="Create Group"
          onPress={() => setShowCreateModal(true)}
        />
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading clubs and groups...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Groups</Text>
        <Button
          label="Create Group"
          onPress={() => setShowCreateModal(true)}
        />
      </View>

      {clubsWithGroups.length === 0 ? (
        renderEmptyClubs()
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Clubs Section */}
          {clubsWithGroups.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Clubs</Text>
              <FlatList
                data={clubsWithGroups}
                renderItem={renderClubCard}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.clubsList}
              />
            </View>
          )}

          {/* Single Club Container */}
          {clubsWithGroups.length === 1 && (
            <View style={styles.singleClubContainer}>
              <View style={styles.clubHeader}>
                <Text style={styles.singleClubName}>{clubsWithGroups[0].name}</Text>
                {clubsWithGroups[0].isUserAdmin && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                )}
              </View>
              <Text style={styles.clubStatsText}>
                {clubsWithGroups[0].groups.length} groups • {clubsWithGroups[0].totalMembers} members
              </Text>
            </View>
          )}

          {/* Groups Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {selectedClub ? `Groups in ${selectedClub.name}` : 'Groups'}
            </Text>
            
            {groupsToShow.length === 0 ? (
              renderEmptyGroups()
            ) : (
              <FlatList
                data={groupsToShow}
                renderItem={renderGroupCard}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.groupsList}
              />
            )}
          </View>
        </ScrollView>
      )}

      <CreateGroupModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          fetchClubsAndGroups(); // Refresh the list
        }}
        userClubs={clubsWithGroups.filter(club => club.isUserAdmin).map(club => ({
          id: club.id,
          name: club.name,
          isAdmin: club.isUserAdmin
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  headerButtonText: {
    fontSize: 14,
    color: theme.colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  clubsList: {
    paddingHorizontal: 4,
  },
  clubCard: {
    backgroundColor: theme.colors.inputBackground,
    padding: 16,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    minWidth: 200,
  },
  selectedClubCard: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  clubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clubName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  selectedClubName: {
    color: theme.colors.primary,
  },
  singleClubContainer: {
    backgroundColor: theme.colors.inputBackground,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  singleClubName: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  adminBadge: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.white,
  },
  clubStats: {
    marginTop: 4,
  },
  clubStatsText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  groupsList: {
    gap: 8,
  },
  groupCard: {
    backgroundColor: theme.colors.inputBackground,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  groupSport: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  groupStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  rolesBadgeContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  roleBadge: {
    backgroundColor: theme.colors.inputBorder,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminRoleBadge: {
    backgroundColor: theme.colors.success,
  },
  coachRoleBadge: {
    backgroundColor: theme.colors.secondary,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.text,
  },
  adminRoleText: {
    color: theme.colors.white,
  },
  coachRoleText: {
    color: theme.colors.white,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  createButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
});
