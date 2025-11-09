import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import { theme } from '@/constants/theme';
import { functions } from '@/services/core/firebase';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Member {
  userId: string;
  role?: string; // Legacy field for backward compatibility
  roles?: string[]; // New field for multiple roles
  name: string;
  email: string;
  belongsToSubGroups?: string[];
  selected: boolean;
  originallySelected: boolean; // Track original state to determine what changed
}

export default function ManageSubgroupMembersScreen() {
  const { groupId, clubId, subgroupName } = useLocalSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: ''
  });

  const showError = (title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  };

  const fetchMembersAndSubgroup = useCallback(async () => {
    if (!groupId || !clubId || !subgroupName || 
        typeof groupId !== 'string' || typeof clubId !== 'string' || typeof subgroupName !== 'string') return;

    setLoading(true);
    console.log('Fetching members with params:', { groupId, clubId, subgroupName });
    try {
      const db = getFirestore();
      
      // Fetch all group members from new architecture
      const membersDoc = await getDocs(
        collection(db, 'clubs', clubId, 'groups', groupId, 'allMembers')
      );
      
      if (membersDoc.empty) {
        console.log('No members document found');
        setMembers([]);
        setLoading(false);
        return;
      }

      // Get the members array from the document
      const membersData = membersDoc.docs[0].data();
      const allGroupMembers = membersData?.members || [];
      
      const processedMembers: Member[] = allGroupMembers.map((memberData: any) => {
        // Handle both old role field and new roles array
        let memberRole = 'member';
        let memberRoles: string[] = [];
        
        if (memberData.roles && Array.isArray(memberData.roles)) {
          // New schema: roles array
          memberRoles = memberData.roles;
          memberRole = memberRoles[0] || 'member'; // Use first role as primary for display
        } else {
          // Old schema: role string
          memberRole = memberData.role || 'member';
          memberRoles = [memberRole];
        }

        // Get member name (could be from member data or need to be fetched)
        const memberName = memberData.name || memberData.email?.split('@')[0] || 'Unknown User';
        
        // Check if member is currently in this subgroup
        const belongsToSubGroups = memberData.belongsToSubGroups || [];
        const isInSubgroup = belongsToSubGroups.includes(subgroupName);

        return {
          userId: memberData.userId,
          role: memberRole,
          roles: memberRoles,
          name: memberName,
          email: memberData.email || '',
          belongsToSubGroups: belongsToSubGroups,
          selected: isInSubgroup,
          originallySelected: isInSubgroup
        };
      });

      setMembers(processedMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, subgroupName]);

  useEffect(() => {
    fetchMembersAndSubgroup();
  }, [fetchMembersAndSubgroup]);

  const toggleMemberSelection = (userId: string) => {
    setMembers(prev => prev.map(member => 
      member.userId === userId 
        ? { ...member, selected: !member.selected }
        : member
    ));
  };

  const handleSave = async () => {
    if (!groupId || !clubId || !subgroupName || 
        typeof groupId !== 'string' || typeof clubId !== 'string' || typeof subgroupName !== 'string') return;

    setSaving(true);
    try {
      const addMemberToSubGroup = httpsCallable(functions, 'addMemberToSubGroup');
      const removeMemberFromSubGroup = httpsCallable(functions, 'removeMemberFromSubGroup');
      
      // Find members whose selection changed
      const membersToAdd = members.filter(m => m.selected && !m.originallySelected);
      const membersToRemove = members.filter(m => !m.selected && m.originallySelected);
      
      // Process additions
      for (const member of membersToAdd) {
        try {
          console.log('Adding member to subgroup:', {
            clubId: clubId,
            groupId: groupId,
            subGroupName: subgroupName,
            userId: member.userId,
            memberName: member.name
          });
          
          const result = await addMemberToSubGroup({
            clubId: clubId,
            groupId: groupId,
            subGroupName: subgroupName,
            userId: member.userId
          });
          
          const response = result.data as any;
          if (!response.success) {
            console.error('Failed to add member:', response.error);
            showError('Error', `Failed to add ${member.name}: ${response.error}`);
          }
        } catch (error) {
          console.error('Error adding member to subgroup:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          showError('Error', `Failed to add ${member.name} to subgroup`);
        }
      }
      
      // Process removals
      for (const member of membersToRemove) {
        try {
          const result = await removeMemberFromSubGroup({
            clubId: clubId,
            groupId: groupId,
            subGroupName: subgroupName,
            userId: member.userId
          });
          
          const response = result.data as any;
          if (!response.success) {
            console.error('Failed to remove member:', response.error);
            showError('Error', `Failed to remove ${member.name}: ${response.error}`);
          }
        } catch (error) {
          console.error('Error removing member from subgroup:', error);
          showError('Error', `Failed to remove ${member.name} from subgroup`);
        }
      }

      router.back();
    } catch (error) {
      console.error('Error saving subgroup members:', error);
      showError('Error', 'Failed to save subgroup members');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const renderMemberItem = ({ item }: { item: Member }) => (
    <TouchableOpacity 
      style={styles.memberItem}
      onPress={() => toggleMemberSelection(item.userId)}
    >
      <View style={styles.memberInfo}>
        <Text style={styles.memberText}>{item.name}</Text>
        <Text style={styles.memberRole}>{item.role}</Text>
      </View>
      <View style={styles.checkbox}>
        {item.selected && (
          <Ionicons name="checkmark" size={20} color={theme.colors.secondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading members...</Text>
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
          <Text style={styles.title}>Manage Members</Text>
          <Text style={styles.subtitle}>
            Select members for {typeof subgroupName === 'string' ? subgroupName : 'Subgroup'}
          </Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.instructionText}>
            Tap to select/deselect members for this subgroup:
          </Text>

          {members.length > 0 ? (
            <FlatList
              data={members}
              renderItem={renderMemberItem}
              keyExtractor={(item) => item.userId}
              scrollEnabled={false}
              style={styles.membersList}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No members found in this group</Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <Button
              label="Save Changes"
              onPress={handleSave}
              theme="primary"
              loading={saving}
              disabled={saving}
            />
            
            <Button
              label="Cancel"
              onPress={handleCancel}
              theme="secondary"
              disabled={saving}
            />
          </View>
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        confirmText="OK"
        onConfirm={() => setErrorModal({ visible: false, title: '', message: '' })}
        onCancel={() => setErrorModal({ visible: false, title: '', message: '' })}
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
  header: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 22,
  },
  content: {
    flex: 1,
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
  instructionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  membersList: {
    flex: 1,
    marginBottom: theme.spacing.lg,
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
  memberInfo: {
    flex: 1,
  },
  memberText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    backgroundColor: theme.colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
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
  buttonContainer: {
    gap: theme.spacing.md,
  },
});
