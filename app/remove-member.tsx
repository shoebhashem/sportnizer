/**
 * REMOVE MEMBER SCREEN
 * ====================
 * 
 * Generic screen for removing any member type (player, youth, coach, admin).
 * Supports multi-select with batch removal and detailed result feedback.
 * 
 * FEATURES:
 * - Member list filtered by type (player/youth/coach/admin)
 * - Search functionality
 * - Multi-select with checkboxes
 * - Batch removal processing
 * - Detailed success/error reporting
 * 
 * FLOW:
 * 1. Fetch members filtered by type
 * 2. User selects multiple members via checkboxes
 * 3. Click Continue → Show confirmation modal with member list
 * 4. Click Confirm → Loop through and call orchestration service for each member
 * 5. Show results modal with success/failure counts
 * 6. Navigate back (auto-close on full success)
 * 
 * SIMPLIFIED LOGIC:
 * - No guardian status pre-checks (backend handles guardian cascade)
 * - Backend automatically removes guardian roles when youth leaves
 * - Backend automatically marks inactive when roles[] becomes empty
 */

import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchGroupMembers } from '../services/fetchGroupMembers';
import { removeMemberFromClubService } from '../services/orchestration/removeMemberFromClub';
import { removeMemberFromGroupService } from '../services/orchestration/removeMemberFromGroup';

type RemovalLevel = 'club' | 'group';

interface GroupMemberData {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  needsGuardian?: boolean;
  photoURL?: string;
}

export default function RemoveMemberScreen() {
  const { groupId, clubId, memberType, removeType, removalLevel, groupName, clubName } = useLocalSearchParams();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  // Support both 'memberType' and 'removeType' parameters (backward compatibility)
  const actualMemberType = (memberType || removeType) as string;
  
  const [members, setMembers] = useState<GroupMemberData[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<GroupMemberData[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<GroupMemberData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [removalResults, setRemovalResults] = useState<{success: number; failed: number; errors: string[]}>({success: 0, failed: 0, errors: []});
  const [showResultModal, setShowResultModal] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!groupId || typeof groupId !== 'string' || !clubId || typeof clubId !== 'string' || !user?.uid) return;
    
    try {
      setLoading(true);
      const result = await fetchGroupMembers(clubId, groupId);
      
      if (result.success && result.members) {
        console.log('📋 All fetched members:', result.members.length);
        console.log('📋 Member type filter:', actualMemberType);
        console.log('📋 First member data:', JSON.stringify(result.members[0], null, 2));
        
        // Filter by member type
        const filtered = result.members.filter((m: GroupMemberData) => {
          if (actualMemberType === 'player') {
            return m.roles.includes('player');
          } else if (actualMemberType === 'youth') {
            return m.roles.includes('player-underage') || m.needsGuardian;
          } else if (actualMemberType === 'coach') {
            return m.roles.includes('coach');
          } else if (actualMemberType === 'admin') {
            return m.roles.includes('admin') || m.roles.includes('club-admin');
          }
          return false;
        });
        
        console.log('📋 Filtered members:', filtered.length);
        console.log('📋 Filtered member data:', JSON.stringify(filtered, null, 2));
        
        setMembers(filtered);
      } else {
        console.error('Failed to fetch members:', result.error);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, memberType, user?.uid]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const filterMembers = useCallback(() => {
    if (!searchQuery.trim()) {
      setFilteredMembers(members);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = members.filter(m => 
      m.name.toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query)
    );
    setFilteredMembers(filtered);
  }, [members, searchQuery]);

  useEffect(() => {
    filterMembers();
  }, [filterMembers]);

  const handleMemberToggle = (member: GroupMemberData) => {
    setSelectedMembers(prev => {
      const isAlreadySelected = prev.some(m => m.userId === member.userId);
      if (isAlreadySelected) {
        // Remove from selection
        return prev.filter(m => m.userId !== member.userId);
      } else {
        // Add to selection
        return [...prev, member];
      }
    });
  };

  const handleContinue = () => {
    if (selectedMembers.length === 0) return;
    setIsConfirmModalVisible(true);
  };

  const handleConfirmRemoval = async () => {
    if (selectedMembers.length === 0) {
      setIsConfirmModalVisible(false);
      return;
    }
    
    setIsConfirmModalVisible(false);
    setRemoving(true);
    
    const results = {success: 0, failed: 0, errors: [] as string[]};
    const level = (removalLevel as RemovalLevel) || 'group';
    
    // Process each selected member
    for (const member of selectedMembers) {
      try {
        let result;
        
        if (level === 'club') {
          result = await removeMemberFromClubService(
            clubId as string,
            member.userId
          );
        } else {
          const roleToRemove = getRoleToRemove();
          result = await removeMemberFromGroupService(
            clubId as string,
            groupId as string,
            member.userId,
            roleToRemove
          );
        }
        
        console.log(`[DEBUG] Result for ${member.name}:`, JSON.stringify(result, null, 2));
        
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          const errorMsg = result.error || result.message || 'Unknown error';
          console.log(`[DEBUG] Error message: ${errorMsg}`);
          results.errors.push(`${member.name}: ${errorMsg}`);
        }
      } catch (error: any) {
        console.error(`Error removing ${member.name}:`, error);
        results.failed++;
        results.errors.push(`${member.name}: ${error.message || 'Unexpected error'}`);
      }
    }
    
    setRemovalResults(results);
    setRemoving(false);
    setShowResultModal(true);
    
    // Clear selection after showing results
    setSelectedMembers([]);
    
    // Refresh member list
    await fetchMembers();
  };

  const handleCancelConfirm = () => {
    setIsConfirmModalVisible(false);
  };

  const getMemberTypeLabel = () => {
    switch (actualMemberType) {
      case 'player': return 'Player';
      case 'youth': return 'Youth Player';
      case 'coach': return 'Coach';
      case 'admin': return 'Admin';
      default: return 'Member';
    }
  };

  const getRoleLabel = () => {
    switch (actualMemberType) {
      case 'player': return 'player role';
      case 'youth': return 'youth player role';
      case 'coach': return 'coach role';
      case 'admin': return 'admin role';
      default: return 'member';
    }
  };

  /**
   * Map member type to role string for removal
   */
  const getRoleToRemove = (): string | undefined => {
    switch (actualMemberType) {
      case 'player': return 'player';
      case 'youth': return 'player-underage';
      case 'coach': return 'coach';
      case 'admin': return 'admin';
      default: return undefined; // Remove all roles if type not recognized
    }
  };

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
    const isSelected = selectedMembers.some(m => m.userId === item.userId);
    
    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.memberItemSelected]}
        onPress={() => handleMemberToggle(item)}
        disabled={removing}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={16} color={theme.colors.primary} />}
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberEmail}>{item.email}</Text>
          <View style={styles.memberRoles}>
            {item.roles.map(role => (
              <View key={role} style={styles.roleTag}>
                <Text style={styles.roleText}>{role}</Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderConfirmModal = () => {
    const level = (removalLevel as RemovalLevel) || 'group';
    const scope = level === 'club' ? clubName : groupName;
    const memberCount = selectedMembers.length;
    const roleLabel = getRoleLabel();
    
    return (
      <Modal
        visible={isConfirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelConfirm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons 
                name="warning" 
                size={48} 
                color="#FF6B6B" 
              />
              <Text style={styles.modalTitle}>
                Remove {memberCount} {getMemberTypeLabel()}{memberCount > 1 ? 's' : ''}?
              </Text>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalMessage}>
                {level === 'club' 
                  ? `This will remove ${roleLabel} from ${memberCount} member${memberCount > 1 ? 's' : ''} in all groups within ${scope}. This action cannot be undone.`
                  : `This will remove ${roleLabel} from ${memberCount} member${memberCount > 1 ? 's' : ''} in ${scope}. They will remain in the club and other groups.`}
              </Text>
              
              <View style={styles.infoSection}>
                <Text style={styles.infoSectionTitle}>{getMemberTypeLabel()}s to remove:</Text>
                {selectedMembers.map((member) => (
                  <View key={member.userId} style={styles.infoItem}>
                    <Ionicons name="person" size={16} color={theme.colors.textSecondary} />
                    <View style={styles.dependentInfo}>
                      <Text style={styles.infoText}>{member.name}</Text>
                      <Text style={styles.infoSubtext}>{member.email}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={handleCancelConfirm}
                disabled={removing}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmRemoval}
                disabled={removing}
              >
                {removing ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Text style={styles.modalButtonText}>
                    Remove {memberCount > 1 ? `${memberCount} ${getMemberTypeLabel()}s` : getMemberTypeLabel()}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Remove {getMemberTypeLabel()}</Text>
          <Text style={styles.subtitle}>
            {removalLevel === 'club' ? `From ${clubName}` : `From ${groupName}`}
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          editable={!removing}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.instructionText}>
          Select {getMemberTypeLabel().toLowerCase()}(s) to remove:
        </Text>

        {filteredMembers.length > 0 ? (
          <FlatList
            data={filteredMembers}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.userId}
            style={styles.membersList}
            contentContainerStyle={[
              styles.membersListContent,
              selectedMembers.length > 0 && styles.membersListContentWithActions
            ]}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyStateText}>
              {searchQuery ? 'No members match your search' : `No ${getMemberTypeLabel().toLowerCase()}s found`}
            </Text>
          </View>
        )}
      </View>

      {selectedMembers.length > 0 && (
        <View style={[styles.actionContainer, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}>
          <View style={styles.actionButton}>
            <Button
              label="Cancel"
              onPress={() => setSelectedMembers([])}
              theme="secondary"
              disabled={removing}
            />
          </View>
          <View style={styles.actionButton}>
            <Button
              label={removing ? 'Removing...' : `Continue (${selectedMembers.length})`}
              onPress={handleContinue}
              theme="primary"
              disabled={removing}
              loading={removing}
            />
          </View>
        </View>
      )}

      {renderConfirmModal()}

      {/* Results Modal */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowResultModal(false);
          if (removalResults.failed === 0) {
            router.back();
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons 
                name={removalResults.failed === 0 ? 'checkmark-circle' : 'warning'} 
                size={48} 
                color={removalResults.failed === 0 ? theme.colors.secondary : '#FF6B6B'} 
              />
              <Text style={styles.modalTitle}>
                {removalResults.failed === 0 ? `${getMemberTypeLabel()}s Removed` : 'Removal Complete'}
              </Text>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalMessage}>
                {removalResults.success > 0 && `Successfully removed ${getRoleLabel()} from ${removalResults.success} member${removalResults.success > 1 ? 's' : ''}.`}
                {removalResults.failed > 0 && `\n\nFailed to remove ${getRoleLabel()} from ${removalResults.failed} member${removalResults.failed > 1 ? 's' : ''}.`}
              </Text>
              
              {removalResults.errors.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Errors:</Text>
                  {removalResults.errors.map((error, index) => (
                    <View key={index} style={styles.errorItem}>
                      <Ionicons name="close-circle" size={16} color="#FF6B6B" />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={() => {
                  setShowResultModal(false);
                  if (removalResults.failed === 0) {
                    router.back();
                  }
                }}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    marginHorizontal: theme.layout.containerPadding,
    marginVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
  },
  instructionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  membersList: {
    flex: 1,
  },
  membersListContent: {
    paddingBottom: theme.spacing.xl,
  },
  membersListContentWithActions: {
    paddingBottom: 100, // Extra padding when action buttons are visible
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
  },
  memberItemSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: `${theme.colors.secondary}10`,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    marginRight: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  memberEmail: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  memberRoles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  roleTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.small,
  },
  roleText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.containerPadding,
    paddingTop: theme.spacing.lg,
    // paddingBottom will be set dynamically using insets
    backgroundColor: theme.colors.primary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  actionButton: {
    flex: 1,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
  },
  continueButton: {
    flex: 1,
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
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  modalBody: {
    paddingHorizontal: theme.spacing.lg,
    maxHeight: 400,
  },
  modalMessage: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  infoSection: {
    marginBottom: theme.spacing.lg,
  },
  infoSectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.xs,
  },
  infoText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  dependentInfo: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  infoSubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  modalButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
  },
  modalButtonConfirm: {
    backgroundColor: '#FF6B6B',
  },
  modalButtonDisabled: {
    backgroundColor: theme.colors.textSecondary,
  },
  modalButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  modalButtonTextCancel: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  modalButtonTextDisabled: {
    color: theme.colors.primary,
  },
  errorItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: '#FFF5F5',
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.xs,
  },
  errorText: {
    fontSize: theme.typography.fontSize.small,
    color: '#FF6B6B',
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
});
