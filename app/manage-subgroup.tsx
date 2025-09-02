import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Group {
  id: string;
  name: string;
  createdBy: string;
  ageGroup?: number; // 1=children, 2=adults, 3=mixed
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
  createdBy: string;
}

export default function ManageSubgroupScreen() {
  const { groupId, subgroupId, subgroupName } = useLocalSearchParams();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [subgroup, setSubgroup] = useState<Subgroup | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [subgroupMembers, setSubgroupMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Check if user is admin or coach (can manage group/subgroups)
  const canManage = user && group && (
    group.createdBy === user.uid || 
    members.some(member => member.id === user.uid && (member.role === 'admin' || member.role === 'coach'))
  );

  const fetchData = useCallback(async () => {
    if (!groupId || !subgroupId || typeof groupId !== 'string' || typeof subgroupId !== 'string') return;

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

      // Fetch subgroup info
      const subgroupDoc = await getDoc(doc(db, 'groups', groupId, 'subgroups', subgroupId));
      if (subgroupDoc.exists()) {
        setSubgroup({
          id: subgroupDoc.id,
          name: subgroupDoc.data().name,
          memberIds: subgroupDoc.data().memberIds || [],
          createdBy: subgroupDoc.data().createdBy
        });
      }

      // Fetch all group members
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
      
      // Filter subgroup members
      if (subgroupDoc.exists()) {
        const subgroupMemberIds = subgroupDoc.data().memberIds || [];
        const subgroupMembersData = membersData.filter(member => subgroupMemberIds.includes(member.id));
        setSubgroupMembers(subgroupMembersData);
      }
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, subgroupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleManageMembers = () => {
    router.push(`/manage-subgroup-members?groupId=${groupId}&subgroupId=${subgroupId}&subgroupName=${encodeURIComponent(subgroupName as string)}` as any);
  };

  const renderMemberItem = ({ item }: { item: Member }) => (
    <View style={styles.memberItem}>
      <Text style={styles.memberText}>{item.name}</Text>
      <Text style={styles.memberRole}>{item.role}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading subgroup data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group || !subgroup) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Subgroup not found</Text>
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
        {/* Header */}
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
          <View style={styles.titleContainer}>
            <Text style={styles.groupTitle}>{group.name}</Text>
            <Text style={styles.subgroupTitle}>{subgroup.name}</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        {/* Manage Members Button */}
        {canManage && (
          <View style={{ marginBottom: 16 }}>
            <Button
              label="Manage Members"
              onPress={handleManageMembers}
              theme="primary"
            />
          </View>
        )}
        
        {/* Members Section */}
        <Text style={styles.sectionTitle}>Members ({subgroupMembers.length})</Text>
        
        {subgroupMembers.length > 0 ? (
          <FlatList
            data={subgroupMembers}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            style={styles.membersList}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No members in this subgroup yet</Text>
            {canManage && (
              <Text style={styles.emptySubtext}>Use &quot;Manage Members&quot; to add members to this subgroup</Text>
            )}
          </View>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.sm,
  },
  backButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  groupTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  subgroupTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  placeholder: {
    width: 40, // Same width as back button for centering
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.md,
  },
  membersList: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  memberText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
});
