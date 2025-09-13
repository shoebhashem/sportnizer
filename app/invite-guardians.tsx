import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { sendGuardianInvitations } from '@/services/guardianInvitationService';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface UnconfirmedMember {
  id: string;
  name: string;
  birthDate?: string;
  guardianEmails?: string[];
  invitationToken?: string;
}

interface MemberSelection {
  member: UnconfirmedMember;
  selected: boolean;
  guardianEmails: string[];
}

export default function InviteGuardiansScreen() {
  const { groupId, groupName } = useLocalSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [memberSelections, setMemberSelections] = useState<MemberSelection[]>([]);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmText, setModalConfirmText] = useState('OK');
  const [modalCancelText, setModalCancelText] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(() => () => {});

  // Helper function to show modal
  const showModal = (title: string, message: string, confirmText = 'OK', cancelText = '', onConfirm: () => void = () => {}) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalCancelText(cancelText);
    setModalOnConfirm(() => onConfirm);
    setModalVisible(true);
  };

  const hideModal = () => {
    setModalVisible(false);
  };

  const fetchUnconfirmedMembers = useCallback(async () => {
    if (!groupId || !user?.uid) return;
    
    try {
      setLoading(true);
      const db = getFirestore();
      
      // Fetch unconfirmed members from members subcollection
      const membersSnapshot = await getDocs(collection(db, 'groups', groupId as string, 'members'));
      const unconfirmedMembers: UnconfirmedMember[] = [];
      
      membersSnapshot.forEach((memberDoc) => {
        const memberData = memberDoc.data();
        if (memberData.isConfirmed === false) {
          unconfirmedMembers.push({
            id: memberDoc.id,
            name: memberData.name,
            birthDate: memberData.birthDate,
            guardianEmails: memberData.guardianEmails || [],
            invitationToken: memberData.invitationToken
          });
        }
      });

      // Initialize selection state
      const selections: MemberSelection[] = unconfirmedMembers.map(member => ({
        member,
        selected: false,
        guardianEmails: member.guardianEmails?.length ? [...member.guardianEmails] : ['']
      }));

      setMemberSelections(selections);
    } catch (error) {
      console.error('Error fetching unconfirmed members:', error);
      showModal('Error', 'Failed to load members. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [groupId, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      fetchUnconfirmedMembers();
    }, [fetchUnconfirmedMembers])
  );

  const toggleMemberSelection = (index: number) => {
    setMemberSelections(prev => prev.map((selection, i) => 
      i === index ? { ...selection, selected: !selection.selected } : selection
    ));
  };

  const updateMemberEmail = (memberIndex: number, emailIndex: number, email: string) => {
    setMemberSelections(prev => prev.map((selection, i) => {
      if (i === memberIndex) {
        const newEmails = [...selection.guardianEmails];
        newEmails[emailIndex] = email;
        return { ...selection, guardianEmails: newEmails };
      }
      return selection;
    }));
  };

  const addEmailToMember = (memberIndex: number) => {
    setMemberSelections(prev => prev.map((selection, i) => {
      if (i === memberIndex && selection.guardianEmails.length < 3) {
        return { ...selection, guardianEmails: [...selection.guardianEmails, ''] };
      }
      return selection;
    }));
  };

  const removeEmailFromMember = (memberIndex: number, emailIndex: number) => {
    setMemberSelections(prev => prev.map((selection, i) => {
      if (i === memberIndex && selection.guardianEmails.length > 1) {
        const newEmails = selection.guardianEmails.filter((_, ei) => ei !== emailIndex);
        return { ...selection, guardianEmails: newEmails };
      }
      return selection;
    }));
  };

  const getSelectedMembers = () => {
    return memberSelections.filter(selection => selection.selected);
  };

  const canSendInvitations = () => {
    const selected = getSelectedMembers();
    return selected.length > 0 && selected.every(selection => 
      selection.guardianEmails.some(email => email.trim() !== '')
    );
  };

  const handleSendInvitations = async () => {
    const selectedMembers = getSelectedMembers();
    
    if (selectedMembers.length === 0) {
      showModal('No Selection', 'Please select at least one member to send invitations to.');
      return;
    }

    setSending(true);

    try {
      const results = [];
      
      // Send invitations for each selected member with their guardian emails
      for (const selection of selectedMembers) {
        const validEmails = selection.guardianEmails.filter(email => email.trim() !== '');
        
        if (validEmails.length > 0) {
          const result = await sendGuardianInvitations({
            groupId: groupId as string,
            selectedMemberIds: [selection.member.id],
            guardianEmails: validEmails
          });
          
          results.push({
            memberName: selection.member.name,
            success: result.success,
            error: result.error
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      if (successCount > 0) {
        let message = `Successfully sent invitations for ${successCount} member(s).`;
        if (failureCount > 0) {
          message += `\n${failureCount} invitation(s) failed to send.`;
        }
        
        showModal('Invitations Sent', message, 'OK', '', () => {
          hideModal();
          // Refresh the data to show updated status
          fetchUnconfirmedMembers();
        });
      } else {
        showModal('Error', 'Failed to send any invitations. Please try again.');
      }
    } catch (error) {
      console.error('Error sending guardian invitations:', error);
      showModal('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invite Guardians</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading members...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Guardians</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.description}>
          <Text style={styles.descriptionText}>
            Select members and add their guardian email addresses to send invitation links.
          </Text>
          <Text style={styles.descriptionSubtext}>
            Guardians will be able to manage their children&apos;s participation in {groupName}.
          </Text>
        </View>

        {memberSelections.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>No Unconfirmed Members</Text>
            <Text style={styles.emptyStateText}>
              All members have been confirmed by their guardians.
            </Text>
          </View>
        ) : (
          <View style={styles.membersList}>
            {memberSelections.map((selection, memberIndex) => (
              <View key={selection.member.id} style={styles.memberCard}>
                <TouchableOpacity 
                  style={styles.memberHeader}
                  onPress={() => toggleMemberSelection(memberIndex)}
                >
                  <View style={styles.memberInfo}>
                    <View style={styles.selectionIndicator}>
                      {selection.selected ? (
                        <Ionicons name="checkbox" size={24} color={theme.colors.secondary} />
                      ) : (
                        <Ionicons name="square-outline" size={24} color={theme.colors.textSecondary} />
                      )}
                    </View>
                    <View style={styles.memberDetails}>
                      <Text style={styles.memberName}>{selection.member.name}</Text>
                      {selection.member.birthDate && (
                        <Text style={styles.memberBirthDate}>Born: {selection.member.birthDate}</Text>
                      )}
                      <View style={styles.statusIndicator}>
                        {selection.member.invitationToken ? (
                          <Text style={styles.statusSent}>✓ Invitation Sent</Text>
                        ) : (
                          <Text style={styles.statusPending}>⏳ Pending Invitation</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>

                {selection.selected && (
                  <View style={styles.emailSection}>
                    <Text style={styles.emailSectionTitle}>Guardian Email Addresses:</Text>
                    <Text style={styles.emailSectionSubtitle}>Maximum 3 guardians per child</Text>
                    
                    {selection.guardianEmails.map((email, emailIndex) => (
                      <View key={emailIndex} style={styles.emailInputRow}>
                        <View style={styles.emailInputContainer}>
                          <Input
                            label={`Guardian ${emailIndex + 1}`}
                            value={email}
                            onChangeText={(text) => updateMemberEmail(memberIndex, emailIndex, text)}
                            placeholder="guardian@email.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                          />
                        </View>
                        {selection.guardianEmails.length > 1 && (
                          <TouchableOpacity 
                            onPress={() => removeEmailFromMember(memberIndex, emailIndex)}
                            style={styles.removeEmailButton}
                          >
                            <Ionicons name="close-circle" size={24} color={theme.colors.error} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}

                    {selection.guardianEmails.length < 3 && (
                      <TouchableOpacity 
                        onPress={() => addEmailToMember(memberIndex)} 
                        style={styles.addEmailButton}
                      >
                        <Ionicons name="add-circle" size={20} color={theme.colors.secondary} />
                        <Text style={styles.addEmailText}>Add another guardian</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {memberSelections.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.selectionSummary}>
            <Text style={styles.selectionText}>
              {getSelectedMembers().length} of {memberSelections.length} members selected
            </Text>
          </View>
          <Button
            label={sending ? "Sending Invitations..." : "Send Invitations"}
            onPress={handleSendInvitations}
            theme="primary"
            disabled={sending || !canSendInvitations()}
          />
        </View>
      )}
    </SafeAreaView>
    
    <ConfirmationModal
      visible={modalVisible}
      title={modalTitle}
      message={modalMessage}
      confirmText={modalConfirmText}
      cancelText={modalCancelText}
      onConfirm={() => {
        modalOnConfirm();
        if (!modalCancelText) {
          hideModal();
        }
      }}
      onCancel={hideModal}
    />
    </>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  headerSpacer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  description: {
    marginVertical: 20,
  },
  descriptionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 24,
    marginBottom: 8,
  },
  descriptionSubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  membersList: {
    marginBottom: 20,
  },
  memberCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  memberHeader: {
    padding: 16,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionIndicator: {
    marginRight: 16,
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: 4,
  },
  memberBirthDate: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  statusIndicator: {
    alignSelf: 'flex-start',
  },
  statusSent: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
  },
  statusPending: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  emailSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  emailSectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: 4,
  },
  emailSectionSubtitle: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  emailInputContainer: {
    flex: 1,
    marginRight: 12,
  },
  removeEmailButton: {
    padding: 8,
    marginBottom: 8,
  },
  addEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  addEmailText: {
    marginLeft: 8,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  selectionSummary: {
    marginBottom: 16,
  },
  selectionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
