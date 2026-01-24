/**
 * MANAGE MEMBERS SCREEN
 * =====================
 * 
 * Central hub for all member management operations within a group.
 * Permission-based sections allow different roles to perform appropriate actions.
 * 
 * FEATURES:
 * - Permission-based visibility (coach/admin/club-admin)
 * - Add members: Player, Youth Player, Coach, Admin
 * - Remove members: Player, Youth Player, Coach, Admin
 * - Consolidated member management interface
 * 
 * PERMISSIONS:
 * - Coach/Admin: Can add/remove players and youth players
 * - Club-Admin: Can add/remove players, youth, coaches, and admins
 * - Regular members: No access (redirected)
 */

import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchGroupMembers } from '../services/fetchGroupMembers';
import { groupService } from '../services/group';
import { GroupData } from '../services/types/group';

type MemberActionType = 'add-player' | 'add-youth' | 'add-coach' | 'add-admin' | 'remove-player' | 'remove-youth' | 'remove-coach' | 'remove-admin';

interface ActionCard {
  type: MemberActionType;
  title: string;
  description: string;
  icon: string;
  requiredRole: 'coach' | 'admin' | 'club-admin';
  theme: 'primary' | 'secondary' | 'danger';
}

export default function ManageMembersScreen() {
  const { groupId, clubId, groupName, clubName } = useLocalSearchParams();
  const { user } = useAuth();
  
  const [group, setGroup] = useState<GroupData | null>(null);
  const [userRole, setUserRole] = useState<string>('member');
  const [loading, setLoading] = useState(true);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchGroupData = useCallback(async () => {
    if (!groupId || typeof groupId !== 'string' || !clubId || typeof clubId !== 'string' || !user?.uid) return;
    
    try {
      setLoading(true);
      
      // Fetch group data
      const groupResult = await groupService.getGroup(clubId, groupId);
      const membersResult = await fetchGroupMembers(clubId, groupId);

      if (groupResult.success && groupResult.data) {
        setGroup(groupResult.data);
      }
      
      // Determine user's role
      const membersData = membersResult.success ? membersResult.members || [] : [];
      let role = 'member';
      
      membersData.forEach((member: any) => {
        if (member.userId === user.uid) {
          if (member.roles.includes('club-admin')) {
            role = 'club-admin';
          } else if (member.roles.includes('admin')) {
            role = 'admin';
          } else if (member.roles.includes('coach')) {
            role = 'coach';
          }
        }
      });
      
      // If user is group creator but not found in members, consider them admin
      if (groupResult.success && groupResult.data && groupResult.data.createdBy === user.uid && role === 'member') {
        role = 'admin';
      }
      
      setUserRole(role);
      
      // If user has no management permissions, show error
      if (role === 'member') {
        setErrorMessage('You do not have permission to manage members in this group.');
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error('Error fetching group data:', error);
      setErrorMessage('Failed to load group data.');
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, user?.uid]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  const handleAction = (actionType: MemberActionType) => {
    const params = {
      groupId: groupId as string,
      clubId: clubId as string,
      groupName: (groupName || group?.name || 'Unknown') as string,
      clubName: clubName as string,
    };

    switch (actionType) {
      case 'add-player':
        router.push({
          pathname: '/add-member-type',
          params,
        });
        break;
      case 'add-youth':
        router.push({
          pathname: '/add-child-member',
          params,
        });
        break;
      case 'add-coach':
        router.push({
          pathname: '/add-coach',
          params,
        });
        break;
      case 'add-admin':
        // TODO: Create add-admin screen (similar to add-coach)
        setErrorMessage('Add Admin functionality is not yet implemented.');
        setShowErrorModal(true);
        break;
      case 'remove-player':
      case 'remove-youth':
      case 'remove-coach':
      case 'remove-admin':
        router.push({
          pathname: '/remove-member',
          params: {
            ...params,
            removeType: actionType.replace('remove-', ''), // player, youth, coach, admin
          },
        });
        break;
    }
  };

  const actions: ActionCard[] = [
    // Player Actions (Available to Coach/Admin/Club-Admin)
    {
      type: 'add-player',
      title: 'Add Player',
      description: 'Invite adult players to join this group',
      icon: 'person-add-outline',
      requiredRole: 'coach',
      theme: 'primary',
    },
    {
      type: 'remove-player',
      title: 'Remove Player',
      description: 'Remove adult players from this group',
      icon: 'person-remove-outline',
      requiredRole: 'coach',
      theme: 'danger',
    },
    // Youth Actions (Available to Coach/Admin/Club-Admin)
    {
      type: 'add-youth',
      title: 'Add Youth Player',
      description: 'Add young players with guardian information',
      icon: 'person-add-outline',
      requiredRole: 'coach',
      theme: 'primary',
    },
    {
      type: 'remove-youth',
      title: 'Remove Youth Player',
      description: 'Remove young players from this group',
      icon: 'person-remove-outline',
      requiredRole: 'coach',
      theme: 'danger',
    },
    // Coach Actions (Available to Club-Admin only)
    {
      type: 'add-coach',
      title: 'Add Coach',
      description: 'Invite or promote members to coach role',
      icon: 'person-add-outline',
      requiredRole: 'club-admin',
      theme: 'secondary',
    },
    {
      type: 'remove-coach',
      title: 'Remove Coach',
      description: 'Remove coach role from group members',
      icon: 'person-remove-outline',
      requiredRole: 'club-admin',
      theme: 'danger',
    },
    // Admin Actions (Available to Club-Admin only)
    {
      type: 'add-admin',
      title: 'Add Admin',
      description: 'Invite or promote members to admin role',
      icon: 'person-add-outline',
      requiredRole: 'club-admin',
      theme: 'secondary',
    },
    {
      type: 'remove-admin',
      title: 'Remove Admin',
      description: 'Remove admin role from group members',
      icon: 'person-remove-outline',
      requiredRole: 'club-admin',
      theme: 'danger',
    },
  ];

  const canPerformAction = (requiredRole: string): boolean => {
    if (userRole === 'club-admin') return true;
    if (userRole === 'admin' && requiredRole !== 'club-admin') return true;
    if (userRole === 'coach' && requiredRole === 'coach') return true;
    return false;
  };

  const getVisibleActions = (): ActionCard[] => {
    return actions.filter(action => canPerformAction(action.requiredRole));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (userRole === 'member') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.errorTitle}>Access Denied</Text>
          <Text style={styles.errorText}>
            You do not have permission to manage members in this group.
          </Text>
          <Button
            label="Go Back"
            onPress={() => router.back()}
            theme="secondary"
          />
        </View>
        <ConfirmationModal
          visible={showErrorModal}
          title="Error"
          message={errorMessage}
          onConfirm={() => {
            setShowErrorModal(false);
            router.back();
          }}
          onCancel={() => {
            setShowErrorModal(false);
            router.back();
          }}
        />
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
          <Text style={styles.title}>Manage Members</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Group Info */}
        <View style={styles.groupInfoContainer}>
          <Text style={styles.groupName}>{group?.name || groupName}</Text>
          <Text style={styles.yourRole}>Your Role: {userRole}</Text>
        </View>

        {/* Actions Grid */}
        <View style={styles.actionsContainer}>
          {getVisibleActions().map((action) => (
            <TouchableOpacity
              key={action.type}
              style={[
                styles.actionCard,
                action.theme === 'danger' && styles.actionCardDanger,
                action.theme === 'secondary' && styles.actionCardSecondary,
              ]}
              onPress={() => handleAction(action.type)}
              activeOpacity={0.7}
            >
              <View style={styles.actionIconContainer}>
                <Ionicons 
                  name={action.icon as any} 
                  size={32} 
                  color={
                    action.theme === 'danger' 
                      ? theme.colors.error 
                      : action.theme === 'secondary'
                      ? theme.colors.secondary
                      : theme.colors.primary
                  } 
                />
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionDescription}>{action.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Error Modal */}
      <ConfirmationModal
        visible={showErrorModal}
        title="Error"
        message={errorMessage}
        onConfirm={() => setShowErrorModal(false)}
        onCancel={() => setShowErrorModal(false)}
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
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  groupInfoContainer: {
    backgroundColor: theme.colors.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
  },
  groupName: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  yourRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    textTransform: 'capitalize',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  actionCard: {
    width: '48%',
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    alignItems: 'center',
    minHeight: 160,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  actionCardDanger: {
    borderColor: theme.colors.error,
  },
  actionCardSecondary: {
    borderColor: theme.colors.secondary,
  },
  actionIconContainer: {
    marginBottom: theme.spacing.md,
  },
  actionTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  actionDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
});
