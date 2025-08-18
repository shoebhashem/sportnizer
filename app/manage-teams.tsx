import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Group {
  id: string;
  name: string;
  sportType: string;
  location: string;
  createdBy: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending';
  joinedAt?: Date;
}

export default function ManageTeamsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);

  // Mock data for now - we'll implement Firebase logic later
  useEffect(() => {
    // Simulate loading user's groups
    setTimeout(() => {
      const mockGroups: Group[] = [
        {
          id: '1',
          name: 'Champions League',
          sportType: 'Football',
          location: 'Stockholm',
          createdBy: user?.uid || ''
        },
        {
          id: '2',
          name: 'Basketball Stars',
          sportType: 'Basketball',
          location: 'Gothenburg',
          createdBy: 'other-user'
        }
      ];
      setGroups(mockGroups);
      if (mockGroups.length > 0) {
        setSelectedGroupId(mockGroups[0].id);
      }
      setLoading(false);
    }, 1000);
  }, [user]);

  const loadMembers = useCallback(async (groupId: string) => {
    setMembersLoading(true);
    // Mock member data - we'll implement Firebase logic later
    setTimeout(() => {
      const mockMembers: Member[] = [
        {
          id: user?.uid || '1',
          name: user?.displayName || user?.email?.split('@')[0] || 'You',
          email: user?.email || 'your@email.com',
          role: 'owner',
          status: 'active',
          joinedAt: new Date()
        },
        {
          id: '2',
          name: 'John Doe',
          email: 'john@email.com',
          role: 'member',
          status: 'active',
          joinedAt: new Date()
        },
        {
          id: '3',
          name: '',
          email: 'pending@email.com',
          role: 'member',
          status: 'pending'
        }
      ];
      setMembers(mockMembers);
      setMembersLoading(false);
    }, 500);
  }, [user]);

  useEffect(() => {
    if (selectedGroupId) {
      loadMembers(selectedGroupId);
    }
  }, [selectedGroupId, loadMembers]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const isOwnerOrAdmin = selectedGroup && (
    selectedGroup.createdBy === user?.uid || 
    members.find(m => m.id === user?.uid)?.role === 'admin'
  );

  const handleAddMembers = () => {
    // Navigate to add members screen (to be created later)
    alert('Add Members feature coming soon!');
  };

  const handleMemberPress = (member: Member) => {
    // Show member details modal or navigate to member details (to be implemented)
    alert(`Member details for ${member.name || member.email} coming soon!`);
  };

  const renderMember = ({ item }: { item: Member }) => (
    <TouchableOpacity style={styles.memberItem} onPress={() => handleMemberPress(item)}>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {item.name || item.email}
          {item.id === user?.uid && ' (You)'}
        </Text>
        <Text style={styles.memberEmail}>{item.email}</Text>
        <View style={styles.memberMeta}>
          <View style={[styles.roleTag, styles[`${item.role}Role`]]}>
            <Text style={styles.roleText}>{item.role.toUpperCase()}</Text>
          </View>
          <View style={[styles.statusTag, styles[`${item.status}Status`]]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading your teams...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (groups.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Teams Found</Text>
          <Text style={styles.emptySubtitle}>
            You don&apos;t belong to any teams yet. Create your first group to get started!
          </Text>
          <Button
            label="Create Group"
            theme="primary"
            onPress={() => router.push('/create-group')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.groupTabs}
          contentContainerStyle={styles.groupTabsContent}
        >
          {groups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={[
                styles.groupTab,
                selectedGroupId === group.id && styles.selectedGroupTab
              ]}
              onPress={() => setSelectedGroupId(group.id)}
            >
              <Text style={[
                styles.groupTabText,
                selectedGroupId === group.id && styles.selectedGroupTabText
              ]}>
                {group.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        {isOwnerOrAdmin && (
          <Button
            label="Add Members"
            theme="primary"
            onPress={handleAddMembers}
          />
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>
          Team Members ({members.length})
        </Text>
        
        {membersLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.secondary} />
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            renderItem={renderMember}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.membersList}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.md,
  },
  groupTabs: {
    marginBottom: theme.spacing.md,
  },
  groupTabsContent: {
    paddingHorizontal: theme.spacing.sm,
  },
  groupTab: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  selectedGroupTab: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  groupTabText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  selectedGroupTabText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.md,
  },
  membersList: {
    paddingBottom: theme.spacing.xl,
  },
  memberItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  memberEmail: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  memberMeta: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  roleTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
    alignSelf: 'flex-start',
  },
  ownerRole: {
    backgroundColor: '#FFD700',
  },
  adminRole: {
    backgroundColor: '#FF6B6B',
  },
  memberRole: {
    backgroundColor: theme.colors.secondary,
  },
  roleText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  statusTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
    alignSelf: 'flex-start',
  },
  activeStatus: {
    backgroundColor: '#4CAF50',
  },
  pendingStatus: {
    backgroundColor: '#FF9800',
  },
  statusText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.layout.containerPadding,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },
});
