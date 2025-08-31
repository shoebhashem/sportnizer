import Button from '@/components/Button';
import DropdownInput from '@/components/DropdownInput';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const [selectedSubgroup, setSelectedSubgroup] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'subgroups'>('members');
  const [showCreateSubgroupModal, setShowCreateSubgroupModal] = useState(false);
  const [subgroupName, setSubgroupName] = useState('');
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);

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
      
      // Set first subgroup as selected by default
      if (subgroupsData.length > 0) {
        setSelectedSubgroup(subgroupsData[0].id);
      }

    } catch (error) {
      console.error('Error fetching group data:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  const handleAddMember = () => {
    if (group && user) {
      const groupName = encodeURIComponent(group.name);
      const inviterName = encodeURIComponent(user.displayName || user.email?.split('@')[0] || 'User');
      router.push(`/addmembers?groupId=${groupId}&groupName=${groupName}&inviterName=${inviterName}` as any);
    }
  };

  const handleCreateSubgroup = () => {
    setSubgroupName('');
    setShowCreateSubgroupModal(true);
  };

  const handleConfirmCreateSubgroup = async () => {
    if (!subgroupName.trim()) {
      return;
    }

    setCreatingSubgroup(true);
    
    try {
      const db = getFirestore();
      
      // Create new subgroup in Firestore
      const subgroupData = {
        name: subgroupName.trim(),
        createdBy: user?.uid,
        createdAt: new Date(),
        memberIds: []
      };
      
      const docRef = await addDoc(collection(db, 'groups', groupId as string, 'subgroups'), subgroupData);
      
      // Add to local state
      const newSubgroup: Subgroup = {
        id: docRef.id,
        name: subgroupName.trim(),
        memberIds: []
      };
      
      setSubgroups(prev => [...prev, newSubgroup]);
      setShowCreateSubgroupModal(false);
      setSubgroupName('');
      
      // Navigate to manage-subgroup screen
      router.push(`/manage-subgroup?groupId=${groupId}&subgroupId=${docRef.id}&groupName=${encodeURIComponent(group?.name || '')}&subgroupName=${encodeURIComponent(subgroupName.trim())}` as any);
    } catch (error) {
      console.error('Error creating subgroup:', error);
    } finally {
      setCreatingSubgroup(false);
    }
  };

  const handleManageSubgroupMembers = () => {
    const subgroupName = subgroups.find(s => s.id === selectedSubgroup)?.name || '';
    router.push(`/manage-subgroup-members?groupId=${groupId}&subgroupId=${selectedSubgroup}&subgroupName=${subgroupName}` as any);
  };

  const renderMemberItem = ({ item }: { item: Member }) => (
    <View style={styles.memberItem}>
      <Text style={styles.memberText}>{item.name}</Text>
      <Text style={styles.memberRole}>{item.role}</Text>
    </View>
  );

  const getSubgroupMembers = () => {
    if (!selectedSubgroup) return [];
    const subgroup = subgroups.find(s => s.id === selectedSubgroup);
    return members.filter(member => subgroup?.memberIds.includes(member.id));
  };

  const renderSubgroupMemberItem = ({ item }: { item: Member }) => (
    <View style={styles.memberItem}>
      <Text style={styles.memberText}>{item.name}</Text>
    </View>
  );

  const renderMembersTab = () => (
    <View style={styles.tabContent}>
      {canManage && (
        <View style={{ marginBottom: 16 }}>
          <Button
            label="Add Member"
            onPress={handleAddMember}
            theme="primary"
            icon="plus"
          />
        </View>
      )}
      
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
    const subgroupOptions = subgroups.map(s => s.name);
    const subgroupMembers = getSubgroupMembers();

    return (
      <View style={styles.tabContent}>
        {canManage && (
          <View style={{ marginBottom: 16 }}>
            <Button
              label="Create Subgroup"
              onPress={handleCreateSubgroup}
              theme="primary"
              icon="plus"
            />
          </View>
        )}

        <Text style={styles.sectionTitle}>Subgroups</Text>

        {subgroups.length > 0 ? (
          <>
            <DropdownInput
              label="Select Subgroup"
              value={subgroups.find(s => s.id === selectedSubgroup)?.name || ''}
              onValueChange={(value) => {
                const subgroup = subgroups.find(s => s.name === value);
                if (subgroup) setSelectedSubgroup(subgroup.id);
              }}
              options={subgroupOptions}
              placeholder="Select a subgroup"
            />

            {canManage && selectedSubgroup && (
              <View style={styles.manageButtonContainer}>
                <Button
                  label={`Manage Members for ${subgroups.find(s => s.id === selectedSubgroup)?.name || 'Subgroup'}`}
                  onPress={handleManageSubgroupMembers}
                  theme="secondary"
                />
              </View>
            )}

            <Text style={styles.subSectionTitle}>
              Members in {subgroups.find(s => s.id === selectedSubgroup)?.name || 'Subgroup'} ({subgroupMembers.length})
            </Text>

            {subgroupMembers.length > 0 ? (
              <FlatList
                data={subgroupMembers}
                renderItem={renderSubgroupMemberItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                style={styles.membersList}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No members in this subgroup yet</Text>
              </View>
            )}
          </>
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

      {/* Create Subgroup Modal */}
      <Modal
        visible={showCreateSubgroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateSubgroupModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowCreateSubgroupModal(false)}
        >
          <View style={styles.modalContainer}>
            <Pressable onPress={() => {}} style={styles.modal}>
              <Text style={styles.modalTitle}>Create Subgroup</Text>
              
              <Input
                label="Subgroup Name"
                value={subgroupName}
                onChangeText={setSubgroupName}
                placeholder="Enter subgroup name"
              />
              
              <View style={styles.modalButtons}>
                <View style={styles.modalButton}>
                  <Button
                    label="Cancel"
                    onPress={() => setShowCreateSubgroupModal(false)}
                    theme="secondary"
                  />
                </View>
                <View style={styles.modalButton}>
                  <Button
                    label={creatingSubgroup ? "Creating..." : "OK"}
                    onPress={handleConfirmCreateSubgroup}
                    theme="primary"
                    disabled={creatingSubgroup || !subgroupName.trim()}
                  />
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    padding: theme.spacing.md,
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  modalButton: {
    flex: 1,
  },
});
