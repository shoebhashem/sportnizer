import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, getFirestore, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Member {
  id: string;
  role?: string; // Legacy field for backward compatibility
  roles?: string[]; // New field for multiple roles
  name: string;
  selected: boolean;
}

export default function ManageSubgroupMembersScreen() {
  const { groupId, subgroupId, subgroupName } = useLocalSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchMembersAndSubgroup = useCallback(async () => {
    if (!groupId || !subgroupId || typeof groupId !== 'string' || typeof subgroupId !== 'string') return;

    setLoading(true);
    try {
      const db = getFirestore();
      
      // Fetch all group members
      const membersSnapshot = await getDocs(collection(db, 'groups', groupId, 'members'));
      const allMembers: Member[] = [];
      
      // For each member, fetch their user data to get their name
      for (const memberDoc of membersSnapshot.docs) {
        const memberId = memberDoc.id;
        const memberData = memberDoc.data();
        
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
        
        // Fetch user data to get the name
        let userName = 'Unknown User';
        
        // Check if name is stored in member document (for children) or fetch from users collection (for adults)
        if (memberData.name) {
          // Name stored in member document (children in ageGroup 1)
          userName = memberData.name;
        } else {
          // Fetch user data from users collection (adults in ageGroup 2)
          try {
            const userDoc = await getDoc(doc(db, 'users', memberId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              userName = userData.name || userData.email?.split('@')[0] || 'Unknown User';
            }
          } catch (error) {
            console.error(`Error fetching user data for ${memberId}:`, error);
          }
        }
        
        allMembers.push({
          id: memberId,
          role: memberRole,
          roles: memberRoles,
          name: userName,
          selected: false
        });
      }

      // Fetch current subgroup to see which members are already selected
      const subgroupDoc = await getDoc(doc(db, 'groups', groupId, 'subgroups', subgroupId));
      const currentMemberIds = subgroupDoc.exists() ? (subgroupDoc.data().memberIds || []) : [];

      // Mark already selected members
      const membersWithSelection = allMembers.map(member => ({
        ...member,
        selected: currentMemberIds.includes(member.id)
      }));

      setMembers(membersWithSelection);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, subgroupId]);

  useEffect(() => {
    fetchMembersAndSubgroup();
  }, [fetchMembersAndSubgroup]);

  const toggleMemberSelection = (memberId: string) => {
    setMembers(prev => prev.map(member => 
      member.id === memberId 
        ? { ...member, selected: !member.selected }
        : member
    ));
  };

  const handleSave = async () => {
    if (!groupId || !subgroupId || typeof groupId !== 'string' || typeof subgroupId !== 'string') return;

    setSaving(true);
    try {
      const db = getFirestore();
      const selectedMemberIds = members.filter(m => m.selected).map(m => m.id);
      
      await updateDoc(doc(db, 'groups', groupId, 'subgroups', subgroupId), {
        memberIds: selectedMemberIds
      });

      router.back();
    } catch (error) {
      console.error('Error saving subgroup members:', error);
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
      onPress={() => toggleMemberSelection(item.id)}
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
              keyExtractor={(item) => item.id}
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
