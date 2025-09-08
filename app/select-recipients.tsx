import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import { theme } from '../constants/theme';
import { getCurrentUser } from '../services/authService';

// Data Interfaces
interface GroupPermission {
  groupId: string;
  groupName: string;
  role: 'admin' | 'coach';
  memberCount: number;
  subgroups?: SubgroupInfo[];
}

interface SubgroupInfo {
  subgroupId: string;
  subgroupName: string;
  memberCount: number;
}

interface Member {
  userId: string;
  name: string;
  role: 'admin' | 'coach' | 'member' | 'guardian';
  groupId: string;
  subgroupId?: string;
}

interface RecipientSelection {
  type: 'all-groups' | 'selected-groups';
  groups: {
    groupId: string;
    scope: 'entire' | 'subgroups' | 'members';
    subgroupIds?: string[];
    memberIds?: string[];
  }[];
  totalCount: number;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
}

// Cache Implementation
class RecipientsCache {
  private static permissions: GroupPermission[] | null = null;
  private static groupMembers: Map<string, Member[]> = new Map();
  private static lastPermissionsUpdate: number = 0;
  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static async getUserPermissions(userId: string, forceRefresh = false): Promise<GroupPermission[]> {
    const now = Date.now();
    
    if (!forceRefresh && 
        this.permissions && 
        (now - this.lastPermissionsUpdate) < this.CACHE_DURATION) {
      return this.permissions;
    }

    try {
      const db = getFirestore();
      const permissions: GroupPermission[] = [];

      // Get user document to find all groups they belong to
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      const userGroupIds = userData?.groupsJoined || [];

      // Get groups where user has admin or coach permissions
      for (const groupId of userGroupIds) {
        try {
          // Get group info
          const groupDoc = await getDoc(doc(db, 'groups', groupId));
          if (!groupDoc.exists()) continue;

          const groupData = groupDoc.data();

          // Get user's role in this group
          const memberDoc = await getDoc(doc(db, 'groups', groupId, 'members', userId));
          if (!memberDoc.exists()) continue;

          const memberData = memberDoc.data();
          const userRole = memberData.role;

          // Only include if user is admin or coach
          if (userRole === 'admin' || userRole === 'coach') {
            // Get subgroups for this group
            const subgroupsSnapshot = await getDocs(collection(db, 'groups', groupId, 'subgroups'));
            const subgroups: SubgroupInfo[] = [];
            
            subgroupsSnapshot.forEach((subgroupDoc) => {
              const subgroupData = subgroupDoc.data();
              subgroups.push({
                subgroupId: subgroupDoc.id,
                subgroupName: subgroupData.name || 'Unnamed Subgroup',
                memberCount: subgroupData.memberCount || 0
              });
            });

            permissions.push({
              groupId: groupId,
              groupName: groupData.name || 'Unnamed Group',
              role: userRole as 'admin' | 'coach',
              memberCount: groupData.membersCount || 0,
              subgroups: subgroups
            });
          }
        } catch (error) {
          console.error(`Error loading group ${groupId}:`, error);
          // Continue with other groups
        }
      }

      this.permissions = permissions;
      this.lastPermissionsUpdate = now;
      return permissions;
    } catch (error) {
      console.error('Error loading user permissions:', error);
      throw error;
    }
  }

  static async getGroupMembers(groupId: string): Promise<Member[]> {
    if (this.groupMembers.has(groupId)) {
      return this.groupMembers.get(groupId)!;
    }

    try {
      const db = getFirestore();
      const members: Member[] = [];

      // Get all members from the group's members subcollection
      const membersSnapshot = await getDocs(collection(db, 'groups', groupId, 'members'));
      
      // Get all users data in batch for efficiency
      const userIds: string[] = [];
      const memberRoles: Map<string, string> = new Map();
      
      membersSnapshot.forEach((memberDoc) => {
        const memberData = memberDoc.data();
        userIds.push(memberDoc.id);
        memberRoles.set(memberDoc.id, memberData.role || 'member');
      });

      // Get user documents for names
      for (const userId of userIds) {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          const userData = userDoc.data();
          
          members.push({
            userId: userId,
            name: userData?.name || userData?.email?.split('@')[0] || 'Unknown User',
            role: memberRoles.get(userId) as 'admin' | 'coach' | 'member' | 'guardian',
            groupId: groupId
          });
        } catch (error) {
          console.error(`Error loading user ${userId}:`, error);
          // Add with minimal info
          members.push({
            userId: userId,
            name: 'Unknown User',
            role: memberRoles.get(userId) as 'admin' | 'coach' | 'member' | 'guardian',
            groupId: groupId
          });
        }
      }

      this.groupMembers.set(groupId, members);
      return members;
    } catch (error) {
      console.error('Error loading group members:', error);
      throw error;
    }
  }

  // Clear cache when needed (e.g., on logout or when data might be stale)
  static clearCache() {
    this.permissions = null;
    this.groupMembers.clear();
    this.lastPermissionsUpdate = 0;
  }

  // Force refresh permissions
  static async refreshPermissions(userId: string): Promise<GroupPermission[]> {
    return this.getUserPermissions(userId, true);
  }
}

export default function SelectRecipientsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse navigation parameters
  const feature = params.feature as string;

  // State
  const [userPermissions, setUserPermissions] = useState<GroupPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupSelectionMode, setGroupSelectionMode] = useState<Map<string, 'entire' | 'subgroups' | 'members'>>(new Map());
  const [selectedSubgroups, setSelectedSubgroups] = useState<Map<string, Set<string>>>(new Map());
  const [selectedMembers, setSelectedMembers] = useState<Map<string, Set<string>>>(new Map());
  const [groupMembers, setGroupMembers] = useState<Map<string, Member[]>>(new Map());
  
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: ''
  });

  // Load user permissions on mount
  useEffect(() => {
    loadUserPermissions();
  }, []);

  // Auto-select all groups when permissions are loaded
  useEffect(() => {
    if (userPermissions.length > 0) {
      const allGroupIds = new Set(userPermissions.map(p => p.groupId));
      setSelectedGroups(allGroupIds);
      
      // Set all groups to 'entire' mode by default
      const allGroupsEntire = new Map();
      userPermissions.forEach(p => {
        allGroupsEntire.set(p.groupId, 'entire');
      });
      setGroupSelectionMode(allGroupsEntire);
    }
  }, [userPermissions]);

  const loadUserPermissions = async () => {
    try {
      setLoading(true);
      
      // Get current authenticated user
      const currentUser = getCurrentUser();
      if (!currentUser) {
        setModal({
          visible: true,
          title: 'Authentication Error',
          message: 'You must be logged in to select recipients.'
        });
        return;
      }

      const permissions = await RecipientsCache.getUserPermissions(currentUser.uid);
      setUserPermissions(permissions);
      
      if (permissions.length === 0) {
        setModal({
          visible: true,
          title: 'No Permissions',
          message: 'You do not have admin or coach permissions in any groups.'
        });
        return;
      }
      
      // All groups will be auto-selected by the useEffect hook
      // that runs when userPermissions change
    } catch (error) {
      console.error('Error loading permissions:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load your group permissions. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadGroupMembers = async (groupId: string) => {
    if (groupMembers.has(groupId)) return;

    try {
      const members = await RecipientsCache.getGroupMembers(groupId);
      setGroupMembers(prev => new Map(prev.set(groupId, members)));
    } catch (error) {
      console.error('Error loading group members:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load group members. Please try again.'
      });
    }
  };

  const toggleGroupExpansion = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (expandedGroups.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
      // Load members when expanding for the first time
      loadGroupMembers(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleGroupSelection = (groupId: string) => {
    const newSelected = new Set(selectedGroups);
    if (selectedGroups.has(groupId)) {
      newSelected.delete(groupId);
      // Clear group's selection mode
      const newMode = new Map(groupSelectionMode);
      newMode.delete(groupId);
      setGroupSelectionMode(newMode);
    } else {
      newSelected.add(groupId);
      // Set default to 'entire'
      const newMode = new Map(groupSelectionMode);
      newMode.set(groupId, 'entire');
      setGroupSelectionMode(newMode);
    }
    setSelectedGroups(newSelected);
  };

  const setGroupScope = (groupId: string, scope: 'entire' | 'subgroups' | 'members') => {
    const newMode = new Map(groupSelectionMode);
    newMode.set(groupId, scope);
    setGroupSelectionMode(newMode);

    // Clear previous selections when changing scope
    if (scope !== 'subgroups') {
      const newSubgroups = new Map(selectedSubgroups);
      newSubgroups.delete(groupId);
      setSelectedSubgroups(newSubgroups);
    }
    if (scope !== 'members') {
      const newMembers = new Map(selectedMembers);
      newMembers.delete(groupId);
      setSelectedMembers(newMembers);
    }

    // Load members if switching to members mode
    if (scope === 'members') {
      loadGroupMembers(groupId);
    }
  };

  const toggleSubgroupSelection = (groupId: string, subgroupId: string) => {
    const groupSubgroups = selectedSubgroups.get(groupId) || new Set();
    const newSubgroups = new Set(groupSubgroups);
    
    if (groupSubgroups.has(subgroupId)) {
      newSubgroups.delete(subgroupId);
    } else {
      newSubgroups.add(subgroupId);
    }
    
    const newSelectedSubgroups = new Map(selectedSubgroups);
    newSelectedSubgroups.set(groupId, newSubgroups);
    setSelectedSubgroups(newSelectedSubgroups);
  };

  const toggleMemberSelection = (groupId: string, memberId: string) => {
    const groupMembers = selectedMembers.get(groupId) || new Set();
    const newMembers = new Set(groupMembers);
    
    if (groupMembers.has(memberId)) {
      newMembers.delete(memberId);
    } else {
      newMembers.add(memberId);
    }
    
    const newSelectedMembers = new Map(selectedMembers);
    newSelectedMembers.set(groupId, newMembers);
    setSelectedMembers(newSelectedMembers);
  };

  const calculateTotalRecipients = (): number => {
    let total = 0;

    selectedGroups.forEach(groupId => {
      const group = userPermissions.find(p => p.groupId === groupId);
      if (!group) return;

      const scope = groupSelectionMode.get(groupId);
      
      switch (scope) {
        case 'entire':
          total += group.memberCount;
          break;
        case 'subgroups':
          const selectedSubs = selectedSubgroups.get(groupId) || new Set();
          selectedSubs.forEach(subgroupId => {
            const subgroup = group.subgroups?.find(s => s.subgroupId === subgroupId);
            if (subgroup) {
              total += subgroup.memberCount;
            }
          });
          break;
        case 'members':
          const selectedMems = selectedMembers.get(groupId) || new Set();
          total += selectedMems.size;
          break;
      }
    });

    return total;
  };

  const getFeatureTitle = () => {
    switch (feature) {
      case 'event': return 'Event Invite';
      case 'recurring-event': return 'Recurring Event';
      case 'poll': return 'Poll';
      case 'announcement': return 'Announcement';
      default: return 'Message';
    }
  };

  const getFeatureAction = () => {
    switch (feature) {
      case 'event': return 'receive the event invite';
      case 'recurring-event': return 'receive the recurring event invite';
      case 'poll': return 'be able to vote in the poll';
      case 'announcement': return 'see the announcement';
      default: return 'receive this message';
    }
  };

  const handleConfirmSelection = () => {
    const totalRecipients = calculateTotalRecipients();
    
    if (totalRecipients === 0) {
      setModal({
        visible: true,
        title: 'No Recipients Selected',
        message: 'Please select at least one recipient to continue.'
      });
      return;
    }

    // Build selection data
    const selection: RecipientSelection = {
      type: 'selected-groups',
      groups: Array.from(selectedGroups).map(groupId => ({
        groupId,
        scope: groupSelectionMode.get(groupId) || 'entire',
        subgroupIds: Array.from(selectedSubgroups.get(groupId) || []),
        memberIds: Array.from(selectedMembers.get(groupId) || [])
      })),
      totalCount: totalRecipients
    };

    // Navigate back with selection data
    console.log('Navigating back with selection:', selection);
    
    if (feature === 'event') {
      // Navigate back to create-event with both recipients and original event data
      const navigationParams: any = {
        recipients: JSON.stringify(selection)
      };
      
      // Preserve original event data if it was passed
      if (params.eventData) {
        navigationParams.eventData = params.eventData;
      }
      
      router.navigate({
        pathname: '/create-event',
        params: navigationParams
      } as any);
    } else {
      // For other features, just go back for now
      router.back();
    }
  };

  const handleModalClose = () => {
    setModal({ ...modal, visible: false });
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.fontSize.medium }}>
            Loading your groups...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.layout.containerPadding,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.inputBorder,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.borderRadius.medium,
            backgroundColor: theme.colors.inputBackground,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: theme.spacing.md,
          }}
        >
          <FontAwesome name="arrow-left" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{
          fontSize: theme.typography.fontSize.large,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text,
          flex: 1,
        }}>
          Select Recipients
        </Text>
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: theme.layout.containerPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Feature Context */}
        <View style={{
          backgroundColor: theme.colors.inputBackground,
          borderRadius: theme.borderRadius.medium,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.lg,
        }}>
          <Text style={{
            color: theme.colors.secondary,
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.xs,
          }}>
            {getFeatureTitle()}
          </Text>
          <Text style={{
            color: theme.colors.text,
            fontSize: theme.typography.fontSize.small,
            lineHeight: 18,
          }}>
            Select who should {getFeatureAction()}
          </Text>
        </View>

        {/* Groups List */}
        <View style={{ marginBottom: theme.spacing.xxl }}>
          <Text style={{
            color: theme.colors.text,
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.medium,
            marginBottom: theme.spacing.md,
          }}>
            Groups ({userPermissions.length})
          </Text>

          {userPermissions.map((group) => (
            <GroupCard
              key={group.groupId}
              group={group}
              isSelected={selectedGroups.has(group.groupId)}
              isExpanded={expandedGroups.has(group.groupId)}
              selectionMode={groupSelectionMode.get(group.groupId)}
              selectedSubgroups={selectedSubgroups.get(group.groupId) || new Set()}
              selectedMembers={selectedMembers.get(group.groupId) || new Set()}
              members={groupMembers.get(group.groupId) || []}
              onToggleSelection={() => toggleGroupSelection(group.groupId)}
              onToggleExpansion={() => toggleGroupExpansion(group.groupId)}
              onSetScope={(scope) => setGroupScope(group.groupId, scope)}
              onToggleSubgroup={(subgroupId) => toggleSubgroupSelection(group.groupId, subgroupId)}
              onToggleMember={(memberId) => toggleMemberSelection(group.groupId, memberId)}
            />
          ))}
        </View>

        {/* Bottom spacing for scroll */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Confirm Selection Button */}
      <View style={{
        padding: theme.layout.containerPadding,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
        backgroundColor: theme.colors.primary,
      }}>
        <Button
          label={`Confirm Selection (${calculateTotalRecipients()} recipients)`}
          onPress={handleConfirmSelection}
          theme="secondary"
        />
      </View>

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
        cancelText={undefined}
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}

// Group Card Component
interface GroupCardProps {
  group: GroupPermission;
  isSelected: boolean;
  isExpanded: boolean;
  selectionMode?: 'entire' | 'subgroups' | 'members';
  selectedSubgroups: Set<string>;
  selectedMembers: Set<string>;
  members: Member[];
  onToggleSelection: () => void;
  onToggleExpansion: () => void;
  onSetScope: (scope: 'entire' | 'subgroups' | 'members') => void;
  onToggleSubgroup: (subgroupId: string) => void;
  onToggleMember: (memberId: string) => void;
}

function GroupCard({
  group,
  isSelected,
  isExpanded,
  selectionMode,
  selectedSubgroups,
  selectedMembers,
  members,
  onToggleSelection,
  onToggleExpansion,
  onSetScope,
  onToggleSubgroup,
  onToggleMember
}: GroupCardProps) {
  const getSelectionIcon = () => {
    if (isSelected) {
      return 'check-square';
    }
    return 'square-o';
  };

  const getSelectionColor = () => {
    if (isSelected) {
      return theme.colors.secondary;
    }
    return theme.colors.textSecondary;
  };

  return (
    <View style={{
      backgroundColor: theme.colors.inputBackground,
      borderRadius: theme.borderRadius.medium,
      marginBottom: theme.spacing.md,
      overflow: 'hidden',
    }}>
      {/* Main Group Card */}
      <TouchableOpacity
        onPress={onToggleSelection}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: theme.spacing.md,
        }}
      >
        <FontAwesome 
          name={getSelectionIcon()} 
          size={20} 
          color={getSelectionColor()}
          style={{ marginRight: theme.spacing.md }}
        />
        
        <View style={{ flex: 1 }}>
          <Text style={{
            color: theme.colors.text,
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.medium,
          }}>
            {group.groupName}
          </Text>
          <Text style={{
            color: theme.colors.textSecondary,
            fontSize: theme.typography.fontSize.small,
            marginTop: theme.spacing.xs,
          }}>
            {group.role} • {group.memberCount} members
            {group.subgroups && group.subgroups.length > 0 && ` • ${group.subgroups.length} subgroups`}
          </Text>
        </View>

        {isSelected && (
          <TouchableOpacity
            onPress={onToggleExpansion}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.colors.primary,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <FontAwesome 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size={14} 
              color={theme.colors.text} 
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Expanded Options */}
      {isExpanded && isSelected && (
        <View style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.inputBorder,
          padding: theme.spacing.md,
        }}>
          {/* Scope Selection */}
          <Text style={{
            color: theme.colors.text,
            fontSize: theme.typography.fontSize.small,
            fontWeight: theme.typography.fontWeight.medium,
            marginBottom: theme.spacing.sm,
          }}>
            Send to:
          </Text>

          {/* Entire Group Option */}
          <TouchableOpacity
            onPress={() => onSetScope('entire')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: theme.spacing.sm,
            }}
          >
            <FontAwesome 
              name={selectionMode === 'entire' ? 'dot-circle-o' : 'circle-o'} 
              size={16} 
              color={selectionMode === 'entire' ? theme.colors.secondary : theme.colors.textSecondary}
              style={{ marginRight: theme.spacing.sm }}
            />
            <Text style={{
              color: theme.colors.text,
              fontSize: theme.typography.fontSize.small,
            }}>
              Entire Group ({group.memberCount} members)
            </Text>
          </TouchableOpacity>

          {/* Subgroups Option */}
          {group.subgroups && group.subgroups.length > 0 && (
            <>
              <TouchableOpacity
                onPress={() => onSetScope('subgroups')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: theme.spacing.sm,
                }}
              >
                <FontAwesome 
                  name={selectionMode === 'subgroups' ? 'dot-circle-o' : 'circle-o'} 
                  size={16} 
                  color={selectionMode === 'subgroups' ? theme.colors.secondary : theme.colors.textSecondary}
                  style={{ marginRight: theme.spacing.sm }}
                />
                <Text style={{
                  color: theme.colors.text,
                  fontSize: theme.typography.fontSize.small,
                }}>
                  Select Subgroups ({group.subgroups.length} available)
                </Text>
              </TouchableOpacity>

              {/* Subgroups List */}
              {selectionMode === 'subgroups' && (
                <View style={{ marginLeft: theme.spacing.lg, marginTop: theme.spacing.sm }}>
                  {group.subgroups.map((subgroup) => (
                    <TouchableOpacity
                      key={subgroup.subgroupId}
                      onPress={() => onToggleSubgroup(subgroup.subgroupId)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: theme.spacing.xs,
                      }}
                    >
                      <FontAwesome 
                        name={selectedSubgroups.has(subgroup.subgroupId) ? 'check-square' : 'square-o'} 
                        size={14} 
                        color={selectedSubgroups.has(subgroup.subgroupId) ? theme.colors.secondary : theme.colors.textSecondary}
                        style={{ marginRight: theme.spacing.sm }}
                      />
                      <Text style={{
                        color: theme.colors.textSecondary,
                        fontSize: theme.typography.fontSize.small,
                      }}>
                        {subgroup.subgroupName} ({subgroup.memberCount} members)
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Individual Members Option */}
          <TouchableOpacity
            onPress={() => onSetScope('members')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: theme.spacing.sm,
            }}
          >
            <FontAwesome 
              name={selectionMode === 'members' ? 'dot-circle-o' : 'circle-o'} 
              size={16} 
              color={selectionMode === 'members' ? theme.colors.secondary : theme.colors.textSecondary}
              style={{ marginRight: theme.spacing.sm }}
            />
            <Text style={{
              color: theme.colors.text,
              fontSize: theme.typography.fontSize.small,
            }}>
              Select Individual Members
            </Text>
          </TouchableOpacity>

          {/* Members List */}
          {selectionMode === 'members' && members.length > 0 && (
            <View style={{ marginLeft: theme.spacing.lg, marginTop: theme.spacing.sm }}>
              {members.map((member) => (
                <TouchableOpacity
                  key={member.userId}
                  onPress={() => onToggleMember(member.userId)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.xs,
                  }}
                >
                  <FontAwesome 
                    name={selectedMembers.has(member.userId) ? 'check-square' : 'square-o'} 
                    size={14} 
                    color={selectedMembers.has(member.userId) ? theme.colors.secondary : theme.colors.textSecondary}
                    style={{ marginRight: theme.spacing.sm }}
                  />
                  <Text style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.typography.fontSize.small,
                    flex: 1,
                  }}>
                    {member.name}
                  </Text>
                  <Text style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.typography.fontSize.small,
                    fontStyle: 'italic',
                  }}>
                    {member.role}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
