import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
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
import { useUserProfile } from '../contexts/UserContext';
// ✅ Using new user.clubAccess structure directly instead of archived services

// Define AccessibleGroupData type based on new service structure
interface AccessibleGroupData {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  userRoles: string[];
  accessReason: 'member' | 'club-admin';
  memberCount?: number;
  subGroups: string[];
}

// Data Interfaces - Updated to match new architecture
interface SubgroupInfo {
  subgroupId: string;
  subgroupName: string;
  memberCount: number;
}



interface RecipientSelection {
  type: 'entire-club' | 'selected-groups' | 'selected-subgroups';
  clubId?: string; // For entire club selection
  groups?: {
    groupId: string;
    scope: 'entire' | 'subgroups';
    subgroupIds?: string[];
  }[];
  totalCount: number;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
}



// Helper function to get subgroups for a group
const getGroupSubgroups = async (clubId: string, groupId: string): Promise<SubgroupInfo[]> => {
  try {
    const db = getFirestore();
    const subgroupsSnapshot = await getDocs(
      collection(db, 'clubs', clubId, 'groups', groupId, 'subgroups')
    );
    
    const subgroups: SubgroupInfo[] = [];
    subgroupsSnapshot.forEach((subgroupDoc) => {
      const subgroupData = subgroupDoc.data();
      subgroups.push({
        subgroupId: subgroupDoc.id,
        subgroupName: subgroupData.name || 'Unnamed Subgroup',
        memberCount: subgroupData.memberCount || 0
      });
    });
    
    return subgroups;
  } catch (error) {
    console.error('Error loading subgroups:', error);
    return [];
  }
};

export default function SelectRecipientsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse navigation parameters
  const feature = params.feature as string;
  const clubId = params.clubId as string; // Get club context from navigation
  
  // Debug: Check what parameters are being passed
  console.log('🔍 Navigation params:', params);

  // Use UserContext hooks
  const { userProfile, isLoading: userLoading } = useUserProfile();
  // Extract accessible groups from userProfile.clubAccess
  const accessibleGroups: AccessibleGroupData[] = React.useMemo(() => {
    if (!userProfile?.clubAccess) return [];
    
    const groups: AccessibleGroupData[] = [];
    userProfile.clubAccess.forEach(clubAccess => {
      if (clubAccess.groupAccess) {
        clubAccess.groupAccess.forEach(groupAccess => {
          groups.push({
            id: groupAccess.groupId,
            name: groupAccess.groupName,
            clubId: clubAccess.clubId,
            clubName: clubAccess.clubName,
            userRoles: groupAccess.roles || [],
            accessReason: clubAccess.role === 'club-admin' ? 'club-admin' : 'member',
            memberCount: 0, // TODO: Get from group document if needed
            subGroups: groupAccess.subGroups || []
          });
        });
      }
    });
    return groups;
  }, [userProfile?.clubAccess]);
  
  const groupsLoading = false; // No async loading needed since data comes from userProfile
  const groupsError = null;

  // State for selection management
  const [selectedClub, setSelectedClub] = useState<boolean>(false);
  const [hasUserInteractedWithClubSelection, setHasUserInteractedWithClubSelection] = useState<boolean>(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedSubgroups, setSelectedSubgroups] = useState<Map<string, Set<string>>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupSubgroups, setGroupSubgroups] = useState<Map<string, SubgroupInfo[]>>(new Map());
  
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: ''
  });

  // Check if user is club admin for the specific club context
  // Fallback: if no clubId provided, use the first admin club
  const effectiveClubId = clubId || userProfile?.clubAccess?.find(club => club.role === 'club-admin')?.clubId;
  const currentClub = userProfile?.clubAccess?.find(club => club.clubId === effectiveClubId);
  const isClubAdmin = currentClub?.role === 'club-admin' || false;
  
  // Debug logging
  console.log('🔍 Select Recipients Debug:', {
    originalClubId: clubId,
    effectiveClubId,
    userProfile: !!userProfile,
    currentClub,
    isClubAdmin,
    accessibleGroups: accessibleGroups.length,
    clubGroups: accessibleGroups.filter(g => g.clubId === effectiveClubId).length
  });

  // Auto-select entire club if user is club admin (only if user hasn't manually interacted)
  useEffect(() => {
    if (isClubAdmin && currentClub && !selectedClub && !hasUserInteractedWithClubSelection) {
      setSelectedClub(true);
    }
  }, [isClubAdmin, currentClub, selectedClub, hasUserInteractedWithClubSelection]);

  // Handle errors from groups loading
  useEffect(() => {
    if (groupsError) {
      setModal({
        visible: true,
        title: 'Error Loading Groups',
        message: groupsError
      });
    }
  }, [groupsError]);

  // Check for no permissions in this specific club
  useEffect(() => {
    if (!groupsLoading && !userLoading && !groupsError && effectiveClubId) {
      const clubGroups = accessibleGroups.filter(g => g.clubId === effectiveClubId);
      if (clubGroups.length === 0 && !isClubAdmin) {
        setModal({
          visible: true,
          title: 'No Permissions',
          message: 'You do not have admin or coach permissions in any groups.'
        });
      }
    }
  }, [accessibleGroups, groupsLoading, userLoading, groupsError, effectiveClubId, isClubAdmin]);

  const loadGroupSubgroups = async (groupId: string) => {
    if (groupSubgroups.has(groupId)) return;

    const group = accessibleGroups.find(g => g.id === groupId);
    if (!group) return;

    try {
      const subgroups = await getGroupSubgroups(group.clubId, groupId);
      setGroupSubgroups(prev => new Map(prev.set(groupId, subgroups)));
    } catch (error) {
      console.error('Error loading group subgroups:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load group subgroups. Please try again.'
      });
    }
  };

  const toggleGroupExpansion = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (expandedGroups.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
      // Load subgroups when expanding for the first time
      loadGroupSubgroups(groupId);
    }
    setExpandedGroups(newExpanded);
  };



  // Group selection handlers
  const toggleGroupSelection = (groupId: string) => {
    const newSelected = new Set(selectedGroups);
    if (selectedGroups.has(groupId)) {
      newSelected.delete(groupId);
      // Remove any selected subgroups for this group
      const newSelectedSubgroups = new Map(selectedSubgroups);
      newSelectedSubgroups.delete(groupId);
      setSelectedSubgroups(newSelectedSubgroups);
    } else {
      newSelected.add(groupId);
      // If selecting a group, deselect club
      setSelectedClub(false);
    }
    setSelectedGroups(newSelected);
  };

  // Subgroup selection handlers
  const toggleSubgroupSelection = (groupId: string, subgroupId: string) => {
    const groupSubgroupsSet = selectedSubgroups.get(groupId) || new Set();
    const newSubgroups = new Set(groupSubgroupsSet);
    
    if (groupSubgroupsSet.has(subgroupId)) {
      newSubgroups.delete(subgroupId);
    } else {
      newSubgroups.add(subgroupId);
      // If selecting a subgroup, deselect club and ensure group is not selected entirely
      setSelectedClub(false);
      const newSelectedGroups = new Set(selectedGroups);
      newSelectedGroups.delete(groupId);
      setSelectedGroups(newSelectedGroups);
    }
    
    const newSelectedSubgroups = new Map(selectedSubgroups);
    if (newSubgroups.size === 0) {
      newSelectedSubgroups.delete(groupId);
    } else {
      newSelectedSubgroups.set(groupId, newSubgroups);
    }
    setSelectedSubgroups(newSelectedSubgroups);
  };

  const calculateTotalRecipients = (): number => {
    let total = 0;

    // If entire club is selected
    if (selectedClub && currentClub) {
      // Count all members in all groups of the club
      accessibleGroups
        .filter(g => g.clubId === currentClub.clubId)
        .forEach(group => {
          total += group.memberCount || 0;
        });
      return total;
    }

    // Count selected groups (entire groups)
    selectedGroups.forEach(groupId => {
      const group = accessibleGroups.find(g => g.id === groupId);
      if (group) {
        total += group.memberCount || 0;
      }
    });

    // Count selected subgroups
    selectedSubgroups.forEach((subgroupIds, groupId) => {
      const subgroups = groupSubgroups.get(groupId) || [];
      subgroupIds.forEach(subgroupId => {
        const subgroup = subgroups.find(s => s.subgroupId === subgroupId);
        if (subgroup) {
          total += subgroup.memberCount;
        }
      });
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

  const buildRecipientSelection = (): RecipientSelection => {
    if (selectedClub && currentClub) {
      return {
        type: 'entire-club',
        clubId: currentClub.clubId,
        totalCount: calculateTotalRecipients()
      };
    }

    const groups: { groupId: string; scope: 'entire' | 'subgroups'; subgroupIds?: string[]; }[] = [];
    
    // Add selected entire groups
    selectedGroups.forEach(groupId => {
      groups.push({
        groupId,
        scope: 'entire',
      });
    });

    // Add groups that have selected subgroups
    selectedSubgroups.forEach((subgroupIds, groupId) => {
      if (subgroupIds.size > 0) {
        groups.push({
          groupId,
          scope: 'subgroups',
          subgroupIds: Array.from(subgroupIds)
        });
      }
    });

    return {
      type: groups.length > 0 ? 'selected-groups' : 'selected-subgroups',
      groups,
      totalCount: calculateTotalRecipients()
    };
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
    const selection: RecipientSelection = buildRecipientSelection();

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
    } else if (feature === 'recurring-event') {
      // Navigate back to create-recurring-event with both recipients and original event data
      const navigationParams: any = {
        recipients: JSON.stringify(selection)
      };
      
      // Preserve original event data if it was passed
      if (params.eventData) {
        navigationParams.eventData = params.eventData;
      }
      
      router.navigate({
        pathname: '/create-recurring-event',
        params: navigationParams
      } as any);
    } else if (feature === 'poll') {
      // Navigate back to create-poll with both recipients and original poll data
      const navigationParams: any = {
        recipients: JSON.stringify(selection)
      };
      
      // Preserve original poll data if it was passed
      if (params.pollData) {
        navigationParams.pollData = params.pollData;
      }
      
      router.navigate({
        pathname: '/create-poll',
        params: navigationParams
      } as any);
    } else if (feature === 'announcement') {
      // Navigate back to make-announcement with both recipients and original announcement data
      const navigationParams: any = {
        recipients: JSON.stringify(selection)
      };
      
      // Preserve original announcement data if it was passed
      if (params.announcementData) {
        navigationParams.announcementData = params.announcementData;
      }
      
      router.navigate({
        pathname: '/make-announcement',
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

  if (userLoading || groupsLoading) {
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

        {/* Club Selection Section */}
        {currentClub && (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <Text style={{
              color: theme.colors.text,
              fontSize: theme.typography.fontSize.medium,
              fontWeight: theme.typography.fontWeight.medium,
              marginBottom: theme.spacing.md,
            }}>
              Club: {currentClub.clubName}
            </Text>
            
            {isClubAdmin ? (
              // Club Admin Options
              <TouchableOpacity
                onPress={() => {
                  setHasUserInteractedWithClubSelection(true);
                  setSelectedClub(!selectedClub);
                  // If selecting club, deselect all groups and subgroups
                  if (!selectedClub) {
                    setSelectedGroups(new Set());
                    setSelectedSubgroups(new Map());
                  }
                }}
                style={{
                  backgroundColor: theme.colors.inputBackground,
                  borderRadius: theme.borderRadius.medium,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <FontAwesome 
                  name={selectedClub ? 'check-square' : 'square-o'} 
                  size={20} 
                  color={selectedClub ? theme.colors.secondary : theme.colors.textSecondary}
                  style={{ marginRight: theme.spacing.md }}
                />
                
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: theme.colors.text,
                    fontSize: theme.typography.fontSize.medium,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}>
                    Send to Entire Club
                  </Text>
                  <Text style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.typography.fontSize.small,
                    marginTop: theme.spacing.xs,
                  }}>
                    All members in all groups will receive the {feature}
                  </Text>
                </View>
                
                <View style={{
                  backgroundColor: theme.colors.secondary,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                  borderRadius: theme.borderRadius.small,
                }}>
                  <Text style={{
                    color: theme.colors.primary,
                    fontSize: theme.typography.fontSize.small,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}>
                    Club Admin
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              // Non-Club Admin Info
              <View style={{
                backgroundColor: theme.colors.inputBackground,
                borderRadius: theme.borderRadius.medium,
                padding: theme.spacing.md,
                marginBottom: theme.spacing.md,
              }}>
                <Text style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.fontSize.small,
                  fontStyle: 'italic',
                }}>
                  You can only send to groups where you have admin or coach permissions. To send to the entire club, you need club admin privileges.
                </Text>
              </View>
            )}
          </View>
        )}



        {/* Groups List */}
        <View style={{ marginBottom: theme.spacing.xxl }}>
          <Text style={{
            color: theme.colors.text,
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.medium,
            marginBottom: theme.spacing.md,
          }}>
            Groups ({accessibleGroups.filter(g => g.clubId === effectiveClubId).length})
          </Text>
          
          {selectedClub && (
            <Text style={{
              color: theme.colors.textSecondary,
              fontSize: theme.typography.fontSize.small,
              marginBottom: theme.spacing.md,
              fontStyle: 'italic',
            }}>
              Individual group selection is disabled when entire club is selected.
            </Text>
          )}

          {accessibleGroups.filter(g => g.clubId === effectiveClubId).map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isSelected={selectedGroups.has(group.id)}
              isExpanded={expandedGroups.has(group.id)}
              selectedSubgroups={selectedSubgroups.get(group.id) || new Set()}
              isDisabled={selectedClub}
              onToggleSelection={() => !selectedClub && toggleGroupSelection(group.id)}
              onToggleExpansion={() => toggleGroupExpansion(group.id)}
              onToggleSubgroup={(subgroupId) => toggleSubgroupSelection(group.id, subgroupId)}
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
        {/* Info text for multiple groups */}
        {Object.keys(selectedGroups).length > 1 && (
          <Text style={{
            fontSize: 12,
            color: theme.colors.textSecondary,
            textAlign: 'center',
            marginBottom: 12,
            fontStyle: 'italic'
          }}>
            Note: If the same user is in multiple selected groups, they will still receive only one invite. The count above may include duplicates.
          </Text>
        )}
        
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
  group: AccessibleGroupData;
  isSelected: boolean;
  isExpanded: boolean;
  selectedSubgroups: Set<string>;
  isDisabled?: boolean;
  onToggleSelection: () => void;
  onToggleExpansion: () => void;
  onToggleSubgroup: (subgroupId: string) => void;
}

function GroupCard({
  group,
  isSelected,
  isExpanded,
  selectedSubgroups,
  isDisabled = false,
  onToggleSelection,
  onToggleExpansion,
  onToggleSubgroup
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

  const hasSubgroups = group.subGroups && group.subGroups.length > 0;

  return (
    <View style={{
      backgroundColor: isDisabled ? theme.colors.inputBorder : theme.colors.inputBackground,
      borderRadius: theme.borderRadius.medium,
      marginBottom: theme.spacing.md,
      overflow: 'hidden',
      opacity: isDisabled ? 0.5 : 1,
    }}>
      {/* Main Group Card */}
      <TouchableOpacity
        onPress={isDisabled ? undefined : onToggleSelection}
        disabled={isDisabled}
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
            {group.name}
          </Text>
          <Text style={{
            color: theme.colors.textSecondary,
            fontSize: theme.typography.fontSize.small,
            marginTop: theme.spacing.xs,
          }}>
            {group.accessReason === 'club-admin' ? 'Club Admin' : `Roles: ${group.userRoles.join(', ')}`} • {group.memberCount || 0} members
            {hasSubgroups && ` • ${group.subGroups?.length} subgroups`}
          </Text>
        </View>

        {isSelected && hasSubgroups && !isDisabled && (
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

      {/* Expanded Subgroups Selection */}
      {isExpanded && isSelected && hasSubgroups && !isDisabled && (
        <View style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.inputBorder,
          padding: theme.spacing.md,
        }}>
          <Text style={{
            color: theme.colors.text,
            fontSize: theme.typography.fontSize.small,
            fontWeight: theme.typography.fontWeight.medium,
            marginBottom: theme.spacing.sm,
          }}>
            Select Subgroups (optional):
          </Text>

          {/* Subgroups List */}
          <View style={{ marginTop: theme.spacing.sm }}>
            {group.subGroups?.map((subgroupName) => (
              <TouchableOpacity
                key={subgroupName}
                onPress={() => onToggleSubgroup(subgroupName)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: theme.spacing.sm,
                }}
              >
                <FontAwesome 
                  name={selectedSubgroups.has(subgroupName) ? 'check-square' : 'square-o'} 
                  size={16} 
                  color={selectedSubgroups.has(subgroupName) ? theme.colors.secondary : theme.colors.textSecondary}
                  style={{ marginRight: theme.spacing.sm }}
                />
                <Text style={{
                  color: theme.colors.text,
                  fontSize: theme.typography.fontSize.small,
                  flex: 1,
                }}>
                  {subgroupName}
                </Text>
                <Text style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.fontSize.small,
                }}>
                  (All members)
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <Text style={{
            color: theme.colors.textSecondary,
            fontSize: theme.typography.fontSize.small,
            marginTop: theme.spacing.sm,
            fontStyle: 'italic',
          }}>
            If no subgroups are selected, the entire group will receive the invitation.
          </Text>
        </View>
      )}
    </View>
  );
}