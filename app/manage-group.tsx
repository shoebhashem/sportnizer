import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import { getDefaultProfilePicture } from '@/constants/profilePictures';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { deleteDoc, doc, getFirestore } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import new services
import { canUserManageGroup, fetchGroupData } from '@/services/group/fetchGroupDataService';
import { fetchGroupMembers } from '@/services/group/fetchGroupMembersService';
import { fetchSubGroups, SubGroup } from '@/services/group/fetchSubGroupsService';
import { GroupData, GroupMemberData } from '@/services/types/group';

export default function ManageGroupScreen() {
  const { groupId, clubId, tab } = useLocalSearchParams();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [members, setMembers] = useState<GroupMemberData[]>([]);
  const [subgroups, setSubgroups] = useState<SubGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'subgroups'>(
    tab === 'subgroups' ? 'subgroups' : 'members'
  );
  const [openKebabMenuId, setOpenKebabMenuId] = useState<string | null>(null);
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());
  const [showDeleteSubgroupModal, setShowDeleteSubgroupModal] = useState(false);
  const [subgroupToDelete, setSubgroupToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Check if user can manage group (is admin, coach, or creator)
  const canManage = group && user && canUserManageGroup(group, user.uid, userRoles);

  const fetchAllData = useCallback(async () => {
    if (!groupId || typeof groupId !== 'string' || !clubId || typeof clubId !== 'string') return;

    setLoading(true);
    try {
      // Fetch all data using services
      const [groupData, membersData, subgroupsData] = await Promise.all([
        fetchGroupData(clubId, groupId),
        fetchGroupMembers(clubId, groupId),
        fetchSubGroups(clubId, groupId)
      ]);

      setGroup(groupData);
      setMembers(membersData);
      
      // Populate memberIds for each subgroup based on members' belongsToSubGroups
      const subgroupsWithMembers = subgroupsData.map(subgroup => ({
        ...subgroup,
        memberIds: membersData
          .filter(member => member.belongsToSubGroups?.includes(subgroup.name))
          .map(member => member.userId)
      }));
      
      setSubgroups(subgroupsWithMembers);

      // Get current user's roles
      if (user && membersData) {
        const currentUserMember = membersData.find(member => member.userId === user.uid);
        setUserRoles(currentUserMember?.roles || []);
      }
    } catch (error) {
      console.error('Error fetching group data:', error);
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
    }, [fetchAllData])
  );

  const handleManageSubgroupMembersFromKebab = (subgroupId: string) => {
    const subgroupName = subgroups.find(s => s.id === subgroupId)?.name || '';
    setOpenKebabMenuId(null); // Close kebab menu
    router.push(`/manage-subgroup?groupId=${groupId}&clubId=${clubId}&subgroupId=${subgroupId}&subgroupName=${encodeURIComponent(subgroupName)}` as any);
  };

  const handleDeleteSubgroupFromKebab = (subgroupId: string) => {
    const subgroup = subgroups.find(s => s.id === subgroupId);
    if (subgroup) {
      setSubgroupToDelete({ id: subgroup.id, name: subgroup.name });
      setOpenKebabMenuId(null); // Close kebab menu
      setShowDeleteSubgroupModal(true);
    }
  };

  const confirmDeleteSubgroup = async () => {
    if (!subgroupToDelete || !clubId || !groupId) return;
    
    try {
      const db = getFirestore();
      
      // Delete the subgroup from Firestore
      await deleteDoc(doc(db, 'clubs', clubId as string, 'groups', groupId as string, 'subgroups', subgroupToDelete.id));
      
      // Remove from local state
      setSubgroups(prev => prev.filter(s => s.id !== subgroupToDelete.id));
      
      // Show success message
      setSuccessMessage(`Subgroup "${subgroupToDelete.name}" has been deleted successfully.`);
      setShowSuccessModal(true);
      
      // Refresh data
      fetchAllData();
    } catch (error) {
      console.error('Error deleting subgroup:', error);
    } finally {
      setShowDeleteSubgroupModal(false);
      setSubgroupToDelete(null);
    }
  };

  const toggleSubgroupExpansion = (subgroupId: string) => {
    // Close any open kebab menu when expanding/collapsing
    setOpenKebabMenuId(null);
    setExpandedSubgroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subgroupId)) {
        newSet.delete(subgroupId);
      } else {
        newSet.add(subgroupId);
      }
      return newSet;
    });
  };

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
    return (
      <View
        style={[
          styles.memberItem,
          openKebabMenuId === item.userId && { zIndex: 999999, position: 'relative' }
        ]}
      >
        <Image
          style={styles.memberAvatar}
          source={{ uri: item.photoURL || getDefaultProfilePicture(item.needsGuardian) }}
        />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberRole}>
            {item.roles.join(', ')} {item.needsGuardian && '(Child/Youth)'}
          </Text>
          {item.belongsToSubGroups && item.belongsToSubGroups.length > 0 && (
            <Text style={styles.memberSubgroups}>
              Subgroups: {item.belongsToSubGroups.join(', ')}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderSubgroupItem = ({ item }: { item: SubGroup }) => {
    const isExpanded = expandedSubgroups.has(item.id);
    const subgroupMembers = members.filter(member => 
      member.belongsToSubGroups?.includes(item.name) || item.memberIds.includes(member.userId)
    );

    return (
      <View
        style={[
          styles.subgroupItem,
          openKebabMenuId === item.id && { zIndex: 999999, position: 'relative' }
        ]}
      >
        {/* Subgroup Header */}
        <TouchableOpacity
          style={styles.subgroupHeader}
          onPress={() => toggleSubgroupExpansion(item.id)}
        >
          <View style={styles.subgroupHeaderLeft}>
            <Text style={styles.subgroupName}>{item.name}</Text>
            <Text style={styles.subgroupCount}>
              {subgroupMembers.length} member{subgroupMembers.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.subgroupHeaderRight}>
            {canManage && (
              <TouchableOpacity
                style={styles.kebabMenuButton}
                onPress={() => setOpenKebabMenuId(openKebabMenuId === item.id ? null : item.id)}
              >
                <Ionicons 
                  name="ellipsis-vertical" 
                  size={20} 
                  color={theme.colors.textSecondary} 
                />
              </TouchableOpacity>
            )}
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={theme.colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {/* Kebab Menu */}
        {openKebabMenuId === item.id && (
          <View style={styles.kebabMenu}>
            <TouchableOpacity
              style={styles.kebabMenuItem}
              onPress={() => handleManageSubgroupMembersFromKebab(item.id)}
            >
              <Ionicons name="people-outline" size={16} color={theme.colors.text} />
              <Text style={styles.kebabMenuText}>Manage Members</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.kebabMenuItem}
              onPress={() => handleDeleteSubgroupFromKebab(item.id)}
            >
              <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
              <Text style={[styles.kebabMenuText, { color: theme.colors.error }]}>Delete Subgroup</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Expanded Members List */}
        {isExpanded && (
          <View style={styles.expandedMembersContainer}>
            {subgroupMembers.length > 0 ? (
              subgroupMembers.map((member) => (
                <View key={member.userId} style={styles.expandedMemberItem}>
                  <Image
                    style={styles.expandedMemberAvatar}
                    source={{ uri: member.photoURL || getDefaultProfilePicture(member.needsGuardian) }}
                  />
                  <View style={styles.expandedMemberInfo}>
                    <Text style={styles.expandedMemberName}>{member.name}</Text>
                    <Text style={styles.expandedMemberRole}>
                      {member.roles.join(', ')} {member.needsGuardian && '(Child/Youth)'}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noMembersText}>No members in this subgroup</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading group data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Group not found</Text>
          <Button
            label="Go Back"
            onPress={() => router.back()}
            theme="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Pressable style={{ flex: 1 }} onPress={() => setOpenKebabMenuId(null)}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons 
                name="arrow-back" 
                size={24} 
                color={theme.colors.text} 
              />
            </TouchableOpacity>
            <Text style={styles.title}>{group.name}</Text>
            <TouchableOpacity 
              style={styles.kebabMenuButton}
              onPress={() => {
                router.push(`/group-settings?groupId=${groupId}&clubId=${clubId}` as any);
              }}
            >
              <Ionicons 
                name="ellipsis-vertical" 
                size={24} 
                color={theme.colors.text} 
              />
            </TouchableOpacity>
          </View>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'members' && styles.activeTab]}
              onPress={() => setActiveTab('members')}
            >
              <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>
                Members ({members.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'subgroups' && styles.activeTab]}
              onPress={() => setActiveTab('subgroups')}
            >
              <Text style={[styles.tabText, activeTab === 'subgroups' && styles.activeTabText]}>
                Subgroups ({subgroups.length})
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'members' ? (
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
      </Pressable>

      {/* Delete Subgroup Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteSubgroupModal}
        title="Delete Subgroup"
        message={`Are you sure you want to delete the subgroup "${subgroupToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteSubgroup}
        onCancel={() => {
          setShowDeleteSubgroupModal(false);
          setSubgroupToDelete(null);
        }}
        confirmButtonTheme="primary"
      />

      {/* Success Modal */}
      <ConfirmationModal
        visible={showSuccessModal}
        title="Success"
        message={successMessage}
        confirmText="OK"
        onConfirm={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        confirmButtonTheme="secondary"
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.large,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
    marginBottom: theme.spacing.lg,
  },
  backButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  title: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: 'bold',
    color: theme.colors.text,
    flex: 1,
  },
  kebabMenuButton: {
    padding: theme.spacing.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    padding: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.small,
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: '500',
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  membersList: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  memberSubgroups: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    marginTop: 2,
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
    overflow: 'hidden',
  },
  subgroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  subgroupHeaderLeft: {
    flex: 1,
  },
  subgroupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  subgroupName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  subgroupCount: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  kebabMenu: {
    position: 'absolute',
    top: 50,
    right: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
    minWidth: 180,
  },
  kebabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  kebabMenuText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  expandedMembersContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  expandedMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  expandedMemberAvatar: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    marginRight: theme.spacing.sm,
  },
  expandedMemberInfo: {
    flex: 1,
  },
  expandedMemberName: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: '500',
    color: theme.colors.text,
  },
  expandedMemberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  noMembersText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
    paddingVertical: theme.spacing.lg,
  },
});
