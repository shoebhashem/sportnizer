/**
 * ADD CHILD/YOUTH MEMBER SCREEN
 * ============================
 * 
 * PURPOSE:
 * Allows club/group administrators to invite youth members (children under 18)
 * to join a specific group. The invitation is sent to the guardian's email.
 * 
 * KEY FEATURES:
 * 1. Guardian email input with validation
 * 2. Child information collection (name, date of birth, relationship)
 * 3. Integration with youth member invitation system
 * 4. Sends guardianInvitationTemplate email for new guardians
 * 5. Creates in-app notification for existing guardians
 * 
 * WORKFLOW:
 * 1. Admin enters guardian email and child information
 * 2. System checks if guardian email belongs to existing user
 * 3. Existing users → get in-app notification
 * 4. New users → receive guardian invitation email
 * 5. Guardian accepts → youth document created → child added to group
 */

import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AddChildMemberScreen() {
  const { groupId, groupName, clubId, clubName } = useLocalSearchParams();
  const { user } = useAuth();

  // Form state
  const [guardianEmail, setGuardianEmail] = useState('');
  const [childName, setChildName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [relationship, setRelationship] = useState('Parent');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmText, setModalConfirmText] = useState('OK');
  const [modalCancelText, setModalCancelText] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(() => () => {});

  // Debug logging
  React.useEffect(() => {
    console.log('🔍 AddChildMember Navigation Params:', {
      groupId,
      groupName,
      clubId,
      clubName,
    });
  }, [groupId, groupName, clubId, clubName]);

  const showModal = (
    title: string,
    message: string,
    confirmText = 'OK',
    cancelText = '',
    onConfirm?: () => void
  ) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalCancelText(cancelText);
    setModalOnConfirm(() => onConfirm || hideModal);
    setModalVisible(true);
  };

  const hideModal = () => {
    setModalVisible(false);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    if (!guardianEmail.trim()) {
      showModal('Validation Error', 'Please enter guardian email address');
      return false;
    }

    if (!validateEmail(guardianEmail.trim())) {
      showModal('Validation Error', 'Please enter a valid email address');
      return false;
    }

    if (!childName.trim()) {
      showModal('Validation Error', 'Please enter child\'s name');
      return false;
    }

    if (childName.trim().length < 2) {
      showModal('Validation Error', 'Child\'s name must be at least 2 characters');
      return false;
    }

    if (!dateOfBirth.trim()) {
      showModal('Validation Error', 'Please enter child\'s date of birth');
      return false;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateOfBirth)) {
      showModal('Validation Error', 'Date must be in format YYYY-MM-DD (e.g., 2015-06-15)');
      return false;
    }

    // Validate date is in the past and reasonable
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const minDate = new Date();
    minDate.setFullYear(today.getFullYear() - 25); // Max 25 years old

    if (isNaN(birthDate.getTime())) {
      showModal('Validation Error', 'Please enter a valid date');
      return false;
    }

    if (birthDate > today) {
      showModal('Validation Error', 'Date of birth cannot be in the future');
      return false;
    }

    if (birthDate < minDate) {
      showModal('Validation Error', 'Child must be under 25 years old');
      return false;
    }

    if (!relationship.trim()) {
      showModal('Validation Error', 'Please specify your relationship to the child');
      return false;
    }

    return true;
  };

  const handleSendInvitation = async () => {
    if (!validateForm()) return;

    if (!user) {
      showModal('Error', 'You must be logged in to send invitations');
      return;
    }

    setLoading(true);

    try {
      console.log('📤 Sending youth member invitation:', {
        guardianEmail: guardianEmail.trim(),
        childName: childName.trim(),
        dateOfBirth,
        relationship: relationship.trim(),
        groupId,
        clubId,
      });

      // Use the unified invitation service (same as regular member flow)
      const { addRegularMemberToGroupService } = await import('@/services/orchestration/addRegularMemberToGroup');
      const result = await addRegularMemberToGroupService.inviteUsersToGroup({
        emails: [guardianEmail.trim().toLowerCase()],
        clubId: clubId as string,
        clubName: clubName as string,
        groupId: groupId as string,
        groupName: groupName as string,
        inviterName: user.displayName || user.email || 'Admin',
        inviterUid: user.uid,
        invitationType: 'youth_member',
        role: 'player-underage',
        youthData: {
          childName: childName.trim(),
          dateOfBirth: dateOfBirth,
          relationship: relationship.trim(),
        },
      });

      console.log('📧 Youth invitation result:', result);

      if (result.success && result.results && result.results.length > 0) {
        const inviteResult = result.results[0];
        
        if (inviteResult.success) {
          const isExisting = inviteResult.action === 'in_app_notification';
          const successMessage = isExisting
            ? `✅ Guardian Notified!\n\nAn in-app notification has been sent to ${guardianEmail.trim()}.\n\nThey will be able to add ${childName.trim()} to ${groupName} from their notifications.`
            : `✅ Invitation Sent!\n\nAn email invitation has been sent to ${guardianEmail.trim()}.\n\nThey will receive instructions to add ${childName.trim()} to ${groupName}.`;

          showModal(
            'Success',
            successMessage,
            'Send Another',
            'Done',
            () => {
              // "Send Another" button - Reset form and hide modal
              hideModal();
              setGuardianEmail('');
              setChildName('');
              setDateOfBirth('');
              setRelationship('Parent');
            }
          );
        } else {
          showModal('Error', inviteResult.error || 'Failed to send invitation');
        }
      } else {
        showModal('Error', result.error || 'Failed to send invitation');
      }
    } catch (error: any) {
      console.error('❌ Error sending youth member invitation:', error);
      showModal(
        'Error',
        error.message || 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    showModal(
      'Cancel Invitation',
      'Are you sure you want to cancel? Any entered information will be lost.',
      'Yes, Cancel',
      'No, Continue',
      () => router.back()
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Child/Youth Member</Text>
            <Text style={styles.subtitle}>
              Invite a child to join {groupName || 'this group'}. The invitation will be sent to their guardian.
            </Text>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={theme.colors.secondary} />
            <Text style={styles.infoText}>
              The guardian will receive an invitation to add their child to the group. They will manage all communications and event responses for the child.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Guardian Information</Text>
            
            <Input
              label="Guardian Email *"
              value={guardianEmail}
              onChangeText={setGuardianEmail}
              placeholder="guardian@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
              Child Information
            </Text>

            <Input
              label="Child's Name *"
              value={childName}
              onChangeText={setChildName}
              placeholder="Enter child's full name"
              autoCapitalize="words"
            />

            <Input
              label="Date of Birth *"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD (e.g., 2015-06-15)"
              autoCapitalize="none"
            />

            <Input
              label="Relationship to Guardian *"
              value={relationship}
              onChangeText={setRelationship}
              placeholder="Parent, Guardian, etc."
              autoCapitalize="words"
            />

            <Text style={styles.helperText}>
              * All fields are required
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              label={loading ? 'Sending Invitation...' : 'Send Invitation'}
              onPress={handleSendInvitation}
              theme="primary"
              disabled={loading}
              loading={loading}
            />

            <Button
              label="Cancel"
              onPress={handleCancel}
              theme="secondary"
              disabled={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal */}
      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        confirmText={modalConfirmText}
        cancelText={modalCancelText}
        onConfirm={modalOnConfirm}
        onCancel={modalCancelText === 'Done' ? () => { hideModal(); router.back(); } : hideModal}
        confirmButtonTheme="primary"
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
    padding: theme.layout.containerPadding,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.lg,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  form: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },
  sectionTitleSpaced: {
    marginTop: theme.spacing.lg,
  },
  helperText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    fontStyle: 'italic',
  },
  buttonContainer: {
    gap: theme.spacing.md,
  },
});
