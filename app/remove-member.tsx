/**
 * REMOVE MEMBER SCREEN
 * ====================
 * 
 * Generic screen for removing any member type (player, youth, coach, admin).
 * Handles guardian validation and provides context-aware confirmation modals.
 * 
 * FEATURES:
 * - Member list filtered by type (player/youth/coach/admin)
 * - Search functionality
 * - Radio button selection
 * - Guardian/dependent status checking
 * - Three modal variants:
 *   1. Youth removal (shows guardian info)
 *   2. Guardian blocked (shows dependent list)
 *   3. Standard removal (shows club admin contacts)
 * 
 * FLOW:
 * 1. Fetch members filtered by type
 * 2. User selects member → validate guardian status
 * 3. Show appropriate confirmation modal
 * 4. Call orchestration service (club or group removal)
 * 5. Navigate back with success message
 */

import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { functions } from '../firebaseConfig';
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

interface GuardianInfo {
  name: string;
  email: string;
}

interface DependentInfo {
  name: string;
  email: string;
  clubName: string;
}

interface GuardianDependentStatus {
  isYouth: boolean;
  isGuardian: boolean;
  guardians: GuardianInfo[];
  dependentsInClub: DependentInfo[];
  hasOtherClubs: boolean;
}

interface ModalContent {
  variant: 'youth' | 'guardian-blocked' | 'standard';
  title: string;
  message: string;
  guardians?: GuardianInfo[];
  dependents?: DependentInfo[];
  clubAdminContacts?: string[];
  confirmText: string;
  confirmDisabled?: boolean;
}

export default function RemoveMemberScreen() {
  const { groupId, clubId, memberType, removalLevel, groupName, clubName } = useLocalSearchParams();
  const { user } = useAuth();
  
  const [members, setMembers] = useState<GroupMemberData[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<GroupMemberData[]>([]);
  const [selectedMember, setSelectedMember] = useState<GroupMemberData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [userRole] = useState<string>('member');
  const [guardianStatus, setGuardianStatus] = useState<GuardianDependentStatus | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchMembers = useCallback(async () => {
    if (!groupId || typeof groupId !== 'string' || !clubId || typeof clubId !== 'string' || !user?.uid) return;
    
    try {
      setLoading(true);
      const result = await fetchGroupMembers(clubId, groupId);
      
      if (result.success && result.members) {
        // Filter by member type
        const filtered = result.members.filter((m: GroupMemberData) => {
          if (memberType === 'player') {
            return m.roles.includes('player') && !m.needsGuardian;
          } else if (memberType === 'youth') {
            return m.roles.includes('player-underage') || m.needsGuardian;
          } else if (memberType === 'coach') {
            return m.roles.includes('coach');
          } else if (memberType === 'admin') {
            return m.roles.includes('admin') || m.roles.includes('club-admin');
          }
          return false;
        });
        
        // Exclude current user
        const excludeSelf = filtered.filter((m: GroupMemberData) => m.userId !== user?.uid);
        
        setMembers(excludeSelf);
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

  const handleMemberSelect = async (member: GroupMemberData) => {
    setSelectedMember(member);
    
    // Check guardian/dependent status
    try {
      const checkFunction = httpsCallable(functions, 'checkGuardianDependentStatus');
      const result = await checkFunction({
        userId: member.userId,
        clubId: clubId as string,
      });
      
      const status = result.data as GuardianDependentStatus;
      setGuardianStatus(status);
      
      // Build modal content based on status
      buildModalContent(member, status);
    } catch (error) {
      console.error('Error checking guardian status:', error);
      setErrorMessage('Failed to validate member status. Please try again.');
      setShowErrorModal(true);
    }
  };

  const buildModalContent = async (member: GroupMemberData, status: GuardianDependentStatus) => {
    const level = (removalLevel as RemovalLevel) || 'group';
    const scope = level === 'club' ? 'club' : 'group';
    
    // Variant 1: Guardian with dependents in club (BLOCKED)
    if (status.isGuardian && status.dependentsInClub.length > 0) {
      setModalContent({
        variant: 'guardian-blocked',
        title: 'Cannot Remove Guardian',
        message: `${member.name} is a guardian for ${status.dependentsInClub.length} youth member(s) in this ${scope}. Remove the dependents first or assign a different guardian.`,
        dependents: status.dependentsInClub,
        confirmText: 'OK',
        confirmDisabled: true,
      });
      setShowConfirmModal(true);
      return;
    }
    
    // Variant 2: Youth player (show guardian info)
    if (status.isYouth && status.guardians.length > 0) {
      setModalContent({
        variant: 'youth',
        title: `Remove ${member.name}?`,
        message: `This will remove ${member.name} from ${scope === 'club' ? clubName : groupName}. The guardian(s) will be notified.`,
        guardians: status.guardians,
        confirmText: 'Remove Member',
        confirmDisabled: false,
      });
      setShowConfirmModal(true);
      return;
    }
    
    // Variant 3: Standard removal (fetch club admin contacts for escalation)
    try {
      // If group-level removal, get club admin contacts for escalation message
      let clubAdminContacts: string[] = [];
      
      if (level === 'group') {
        const getContactsFunction = httpsCallable(functions, 'getClubAdminContacts');
        const contactsResult = await getContactsFunction({ clubId: clubId as string });
        clubAdminContacts = (contactsResult.data as any).contacts || [];
      }
      
      setModalContent({
        variant: 'standard',
        title: `Remove ${member.name}?`,
        message: level === 'club' 
          ? `This will remove ${member.name} from all groups in ${clubName}. This action cannot be undone.`
          : `This will remove ${member.name} from ${groupName}. They will remain in the club and other groups.${clubAdminContacts.length > 0 ? ' Club admins will be notified.' : ''}`,
        clubAdminContacts: clubAdminContacts,
        confirmText: 'Remove Member',
        confirmDisabled: false,
      });
      setShowConfirmModal(true);
    } catch (error) {
      console.error('Error building modal content:', error);
      setErrorMessage('Failed to prepare removal. Please try again.');
      setShowErrorModal(true);
    }
  };

  const handleConfirmRemoval = async () => {
    if (!selectedMember || !modalContent || modalContent.confirmDisabled) {
      setShowConfirmModal(false);
      return;
    }
    
    setShowConfirmModal(false);
    setRemoving(true);
    
    try {
      const level = (removalLevel as RemovalLevel) || 'group';
      let result;
      
      if (level === 'club') {
        // Club-level removal
        result = await removeMemberFromClubService(
          clubId as string,
          selectedMember.userId,
          userRole
        );
      } else {
        // Group-level removal
        result = await removeMemberFromGroupService(
          clubId as string,
          groupId as string,
          selectedMember.userId,
          userRole
        );
      }
      
      if (result.success) {
        setShowSuccessModal(true);
        // Navigate back after 2 seconds
        setTimeout(() => {
          router.back();
        }, 2000);
      } else {
        setErrorMessage(result.message || 'Failed to remove member');
        setShowErrorModal(true);
      }
    } catch (error: any) {
      console.error('Error removing member:', error);
      setErrorMessage(error.message || 'An unexpected error occurred');
      setShowErrorModal(true);
    } finally {
      setRemoving(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setSelectedMember(null);
    setGuardianStatus(null);
    setModalContent(null);
  };

  const getMemberTypeLabel = () => {
    switch (memberType) {
      case 'player': return 'Player';
      case 'youth': return 'Youth Player';
      case 'coach': return 'Coach';
      case 'admin': return 'Admin';
      default: return 'Member';
    }
  };

  const renderMemberItem = ({ item }: { item: GroupMemberData }) => {
    const isSelected = selectedMember?.userId === item.userId;
    
    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.memberItemSelected]}
        onPress={() => handleMemberSelect(item)}
        disabled={removing}
      >
        <View style={styles.radioButton}>
          {isSelected && <View style={styles.radioButtonInner} />}
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
    if (!modalContent) return null;
    
    return (
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelConfirm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons 
                name={modalContent.variant === 'guardian-blocked' ? 'warning' : 'information-circle'} 
                size={48} 
                color={modalContent.variant === 'guardian-blocked' ? '#FF6B6B' : theme.colors.secondary} 
              />
              <Text style={styles.modalTitle}>{modalContent.title}</Text>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalMessage}>{modalContent.message}</Text>
              
              {/* Variant: Youth - Show guardians */}
              {modalContent.variant === 'youth' && modalContent.guardians && modalContent.guardians.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Guardian(s):</Text>
                  {modalContent.guardians.map((guardian, index) => (
                    <View key={index} style={styles.infoItem}>
                      <Ionicons name="person" size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.infoText}>{guardian.name} ({guardian.email})</Text>
                    </View>
                  ))}
                </View>
              )}
              
              {/* Variant: Guardian Blocked - Show dependents */}
              {modalContent.variant === 'guardian-blocked' && modalContent.dependents && modalContent.dependents.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Dependent Youth Members:</Text>
                  {modalContent.dependents.map((dependent, index) => (
                    <View key={index} style={styles.infoItem}>
                      <Ionicons name="person" size={16} color={theme.colors.textSecondary} />
                      <View style={styles.dependentInfo}>
                        <Text style={styles.infoText}>{dependent.name}</Text>
                        <Text style={styles.infoSubtext}>{dependent.email}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              
              {/* Variant: Standard - Show club admin contacts (for escalation) */}
              {modalContent.variant === 'standard' && modalContent.clubAdminContacts && modalContent.clubAdminContacts.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Club admins will be notified:</Text>
                  {modalContent.clubAdminContacts.map((contact, index) => (
                    <View key={index} style={styles.infoItem}>
                      <Ionicons name="mail" size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.infoText}>{contact}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            
            <View style={styles.modalActions}>
              {!modalContent.confirmDisabled && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={handleCancelConfirm}
                >
                  <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  modalContent.confirmDisabled ? styles.modalButtonDisabled : styles.modalButtonConfirm
                ]}
                onPress={modalContent.confirmDisabled ? handleCancelConfirm : handleConfirmRemoval}
                disabled={removing}
              >
                <Text style={[
                  styles.modalButtonText,
                  modalContent.confirmDisabled && styles.modalButtonTextDisabled
                ]}>
                  {modalContent.confirmText}
                </Text>
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
          Select a {getMemberTypeLabel().toLowerCase()} to remove:
        </Text>

        {filteredMembers.length > 0 ? (
          <FlatList
            data={filteredMembers}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.userId}
            style={styles.membersList}
            contentContainerStyle={styles.membersListContent}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyStateText}>
              {searchQuery ? 'No members match your search' : `No ${getMemberTypeLabel().toLowerCase()}s found`}
            </Text>
          </View>
        )}

        {selectedMember && (
          <View style={styles.actionContainer}>
            <Button
              label="Cancel"
              onPress={() => setSelectedMember(null)}
              theme="secondary"
              disabled={removing}
            />
            <Button
              label={removing ? 'Removing...' : 'Continue'}
              onPress={() => buildModalContent(selectedMember, guardianStatus!)}
              theme="primary"
              disabled={removing}
              loading={removing}
            />
          </View>
        )}
      </View>

      {renderConfirmModal()}

      {/* Success Modal */}
      <ConfirmationModal
        visible={showSuccessModal}
        title="Member Removed"
        message={`${selectedMember?.name} has been successfully removed.`}
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessModal(false);
          router.back();
        }}
        onCancel={() => {
          setShowSuccessModal(false);
          router.back();
        }}
      />

      {/* Error Modal */}
      <ConfirmationModal
        visible={showErrorModal}
        title="Error"
        message={errorMessage}
        confirmText="OK"
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
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    marginRight: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.secondary,
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
    paddingVertical: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
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
});
