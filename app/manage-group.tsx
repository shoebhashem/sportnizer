import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Group {
  id: string;
  name: string;
  createdBy: string;
}

interface Member {
  id: string;
  role: string;
  name: string;
}

interface Subgroup {
  id: string;
  name: string;
  memberIds: string[];
}

export default function ManageGroupScreen() {
  const { groupId } = useLocalSearchParams();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'subgroups'>('members');
  const [openKebabMenuId, setOpenKebabMenuId] = useState<string | null>(null);
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());

  // Check if user is admin or coach (can manage group/subgroups)
  const canManage = user && group && (
    group.createdBy === user.uid || 
    members.some(member => member.id === user.uid && (member.role === 'admin' || member.role === 'coach'))
  );

  const fetchGroupData = useCallback(async () => {
    if (!groupId || typeof groupId !== 'string') return;

    setLoading(true);
    try {
      const db = getFirestore();
      
      // Fetch group basic info
      const groupDoc = await getDoc(doc(db, 'groups', groupId));
      if (groupDoc.exists()) {
        setGroup({
          id: groupDoc.id,
          name: groupDoc.data().name,
          createdBy: groupDoc.data().createdBy
        });
      }

      // Fetch members
      const membersSnapshot = await getDocs(collection(db, 'groups', groupId, 'members'));
      const membersData: Member[] = [];
      
      // For each member, fetch their user data to get their name
      for (const memberDoc of membersSnapshot.docs) {
        const memberId = memberDoc.id;
        const memberRole = memberDoc.data().role || 'member';
        
        // Fetch user data to get the name
        try {
          const userDoc = await getDoc(doc(db, 'users', memberId));
          const userName = userDoc.exists() ? userDoc.data().name || 'Unknown User' : 'Unknown User';
          
          membersData.push({
            id: memberId,
            role: memberRole,
            name: userName
          });
        } catch (error) {
          console.error(`Error fetching user data for ${memberId}:`, error);
          membersData.push({
            id: memberId,
            role: memberRole,
            name: 'Unknown User'
          });
        }
      }
      setMembers(membersData);

      // Fetch subgroups
      const subgroupsSnapshot = await getDocs(collection(db, 'groups', groupId, 'subgroups'));
      const subgroupsData: Subgroup[] = [];
      subgroupsSnapshot.forEach((doc) => {
        subgroupsData.push({
          id: doc.id,
          name: doc.data().name,
          memberIds: doc.data().memberIds || []
        });
      });
      setSubgroups(subgroupsData);

    } catch (error) {
      console.error('Error fetching group data:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  const handleManageSubgroupMembersFromKebab = (subgroupId: string) => {
    const subgroupName = subgroups.find(s => s.id === subgroupId)?.name || '';
    setOpenKebabMenuId(null); // Close kebab menu
    router.push(`/manage-subgroup-members?groupId=${groupId}&subgroupId=${subgroupId}&subgroupName=${subgroupName}` as any);
  };

  const toggleSubgroupExpansion = (subgroupId: string) => {
    setExpandedSubgroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subgroupId)) {
        newSet.delete(subgroupId);
      } else {
        newSet.add(subgroupId);
      }
      return newSet;
    });
    // Close any open kebab menu when expanding/collapsing
    setOpenKebabMenuId(null);
  };

  const renderMemberItem = ({ item }: { item: Member }) => (
    <View style={styles.memberItem}>
      <Text style={styles.memberText}>{item.name}</Text>
      <Text style={styles.memberRole}>{item.role}</Text>
    </View>
  );

  const renderSubgroupItem = ({ item }: { item: Subgroup }) => {
    const isExpanded = expandedSubgroups.has(item.id);
    const subgroupMembers = members.filter(member => item.memberIds.includes(member.id));

    return (
      <View style={styles.subgroupContainer}>
        {/* Subgroup Header */}
        <View style={styles.subgroupItem}>
          <TouchableOpacity
            style={styles.subgroupHeader}
            onPress={() => toggleSubgroupExpansion(item.id)}
          >
            <View style={styles.subgroupInfo}>
              <Text style={styles.subgroupName}>{item.name}</Text>
              <Text style={styles.subgroupMemberCount}>
                {item.memberIds.length} {item.memberIds.length === 1 ? 'member' : 'members'}
              </Text>
            </View>
          </TouchableOpacity>
          
          {/* Kebab Menu */}
          {canManage && (
            <View style={styles.kebabContainer}>
              <TouchableOpacity
                style={styles.kebabButton}
                onPress={() => setOpenKebabMenuId(openKebabMenuId === item.id ? null : item.id)}
              >
                <Ionicons 
                  name="ellipsis-vertical" 
                  size={20} 
                  color={theme.colors.text} 
                />
              </TouchableOpacity>
              
              {openKebabMenuId === item.id && (
                <View style={styles.kebabMenu}>
                  <TouchableOpacity
                    style={styles.kebabMenuItem}
                    onPress={() => handleManageSubgroupMembersFromKebab(item.id)}
                  >
                    <Ionicons name="people" size={16} color={theme.colors.text} />
                    <Text style={styles.kebabMenuText}>Manage Members</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Expanded Members List */}
        {isExpanded && (
          <View style={styles.expandedMembersContainer}>
            {subgroupMembers.length > 0 ? (
              subgroupMembers.map((member) => (
                <View key={member.id} style={styles.expandedMemberItem}>
                  <Text style={styles.expandedMemberName}>{member.name}</Text>
                  <Text style={styles.expandedMemberRole}>{member.role}</Text>
                </View>
              ))
            ) : (
              <View style={styles.expandedEmptyState}>
                <Text style={styles.expandedEmptyText}>No members assigned</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderMembersTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Members ({members.length})</Text>
      
      {members.length > 0 ? (
        <FlatList
          data={members}
          renderItem={renderMemberItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          style={styles.membersList}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No members added yet</Text>
        </View>
      )}
    </View>
  );

  const renderSubgroupsTab = () => {
    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Subgroups</Text>

        {subgroups.length > 0 ? (
          <FlatList
            data={subgroups}
            renderItem={renderSubgroupItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            style={styles.membersList}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No subgroups created for this group yet</Text>
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
          <Button label="Go Back" onPress={() => router.back()} theme="secondary" />
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
          <Text style={styles.title}>{group.name}</Text>
          <TouchableOpacity 
            style={styles.kebabMenuButton}
            onPress={() => {
              router.push(`/group-settings?groupId=${groupId}` as any);
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
              Members
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'subgroups' && styles.activeTab]}
            onPress={() => setActiveTab('subgroups')}
          >
            <Text style={[styles.tabText, activeTab === 'subgroups' && styles.activeTabText]}>
              Subgroups
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'members' ? renderMembersTab() : renderSubgroupsTab()}
      </ScrollView>
      </Pressable>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    flex: 1,
  },
  kebabMenuButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  tabContent: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.md,
  },
  subSectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  membersList: {
    flex: 1,
  },
  memberItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    flex: 1,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  manageButtonContainer: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  subgroupItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subgroupInfo: {
    flex: 1,
  },
  subgroupName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.spacing.xs,
  },
  subgroupMemberCount: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  kebabContainer: {
    position: 'relative',
  },
  kebabButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  kebabMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
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
  subgroupContainer: {
    marginBottom: theme.spacing.xs,
  },
  subgroupHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandedMembersContainer: {
    marginTop: theme.spacing.sm,
    marginLeft: theme.spacing.md,
    marginRight: theme.spacing.sm,
  },
  expandedMemberItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandedMemberName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    flex: 1,
  },
  expandedMemberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  expandedEmptyState: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    alignItems: 'center',
  },
  expandedEmptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
});
