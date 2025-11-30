import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { functions } from '@/services/core/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface InvitationResult {
  success: boolean;
  error?: string;
  results?: {
    email: string;
    success: boolean;
    error?: string;
  }[];
}



export default function AddRegularMemberScreen() {
  const { groupId, groupName, clubId } = useLocalSearchParams();
  const { user } = useAuth();
  
  // Debug logging
  React.useEffect(() => {
    console.log('User auth status:', {
      user: !!user,
      uid: user?.uid,
      email: user?.email,
      displayName: user?.displayName,
    });
  }, [user]);
  
  // State for email invitations
  const [emailAddresses, setEmailAddresses] = useState<string[]>(['']);
  const [sendingEmails, setSendingEmails] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmText, setModalConfirmText] = useState('OK');
  const [modalCancelText, setModalCancelText] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(() => () => {});

  // Helper function to show modal
  const showModal = (title: string, message: string, confirmText = 'OK', cancelText = '', onConfirm?: () => void) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalCancelText(cancelText);
    setModalOnConfirm(() => onConfirm ? onConfirm : hideModal);
    setModalVisible(true);
  };

  const hideModal = () => {
    setModalVisible(false);
  };

  const addEmailField = () => {
    if (emailAddresses.length < 10) { // Limit to 10 emails
      setEmailAddresses([...emailAddresses, '']);
    }
  };

  const removeEmailField = (index: number) => {
    if (emailAddresses.length > 1) {
      const newEmails = emailAddresses.filter((_, i) => i !== index);
      setEmailAddresses(newEmails);
    }
  };

  const updateEmail = (index: number, email: string) => {
    const newEmails = [...emailAddresses];
    newEmails[index] = email;
    setEmailAddresses(newEmails);
  };

  const validateEmails = (): string[] => {
    const validEmails = emailAddresses
      .map(email => email.trim())
      .filter(email => email.length > 0);
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = validEmails.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      showModal('Invalid Emails', `Please check these email addresses:\n${invalidEmails.join('\n')}`);
      return [];
    }
    
    return validEmails;
  };

  const handleSendEmailInvitations = async () => {
    const validEmails = validateEmails();
    if (validEmails.length === 0) {
      showModal('No Valid Emails', 'Please enter at least one valid email address.');
      return;
    }

    if (!user) {
      showModal('Error', 'Unable to send invitations. Please make sure you are properly logged in.');
      return;
    }

    setSendingEmails(true);

    try {
      const sendGroupInvitation = httpsCallable<any, InvitationResult>(
        functions,
        'sendGroupInvitation'
      );

      const result = await sendGroupInvitation({
        emails: validEmails,
        clubId: clubId as string,
        groupId: groupId as string,
        groupName: groupName as string,
        inviterName: user.displayName || user.email || 'Unknown User',
      });

      console.log('📧 Email invitation result:', result.data);

      if (result.data.success) {
        const successCount = result.data.results?.filter(r => r.success).length || 0;
        const failureCount = result.data.results?.filter(r => !r.success).length || 0;
        const failedResults = result.data.results?.filter(r => !r.success) || [];
        
        console.log('📊 Invitation stats:', { successCount, failureCount, failedResults });
        
        let message = `Successfully sent ${successCount} invitation(s)`;
        if (failureCount > 0) {
          message += `\n${failureCount} invitation(s) failed to send`;
          
          // Add specific error details for failed invitations
          if (failedResults.length > 0) {
            message += '\n\nErrors:';
            failedResults.forEach((failed, index) => {
              const errorMsg = failed.error || 'Unknown error';
              message += `\n• ${failed.email}: ${errorMsg}`;
            });
          }
        }
        
        const title = failureCount > 0 ? 'Invitations Partially Sent' : 'Invitations Sent';
        
        showModal(title, message, 'OK', '', () => {
          hideModal();
          router.back();
        });
        
        // Clear email fields only if all succeeded
        if (failureCount === 0) {
          setEmailAddresses(['']);
        }
      } else {
        console.error('❌ Failed to send invitations:', result.data.error);
        showModal('Error', result.data.error || 'Failed to send invitations');
      }
    } catch (error: any) {
      console.error('❌ Error sending email invitations:', error);
      
      let errorMessage = 'Failed to send invitations. Please try again.';
      
      // Check for specific error types
      if (error.code) {
        switch (error.code) {
          case 'functions/unauthenticated':
            errorMessage = 'Authentication error. Please sign out and sign back in.';
            break;
          case 'functions/permission-denied':
            errorMessage = 'You do not have permission to send invitations to this group.';
            break;
          case 'functions/unavailable':
            errorMessage = 'Invitation service is currently unavailable. Please try again later.';
            break;
          case 'functions/deadline-exceeded':
            errorMessage = 'Request timed out. Please check your internet connection and try again.';
            break;
          default:
            errorMessage = `Error: ${error.message || error.code}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showModal('Error', errorMessage);
    } finally {
      setSendingEmails(false);
    }
  };



  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Add Regular Member</Text>
          <Text style={styles.subtitle}>
            Send email invitations to adults to join {groupName || 'this group'}
          </Text>
        </View>

        {/* Email Invitation Content */}
        <View>
            <View style={styles.instructionCard}>
              <Ionicons name="mail" size={24} color={theme.colors.secondary} />
              <Text style={styles.instructionText}>
                Enter email addresses to send personal invitations. Recipients will receive an email with a secure link to join the group.
              </Text>
            </View>

            <View style={styles.emailSection}>
              <Text style={styles.sectionTitle}>Email Addresses</Text>
              
              {emailAddresses.map((email, index) => (
                <View key={index} style={styles.emailInputRow}>
                  <View style={styles.emailInputContainer}>
                    <Input
                      label={`Email ${index + 1}`}
                      value={email}
                      onChangeText={(text) => updateEmail(index, text)}
                      placeholder="member@email.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {emailAddresses.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeEmailField(index)}
                    >
                      <Ionicons name="close-circle" size={24} color={theme.colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {emailAddresses.length < 10 && (
                <TouchableOpacity style={styles.addEmailButton} onPress={addEmailField}>
                  <Ionicons name="add-circle" size={20} color={theme.colors.secondary} />
                  <Text style={styles.addEmailText}>Add another email</Text>
                </TouchableOpacity>
              )}
            </View>

            <Button
              label={sendingEmails ? "Sending Invitations..." : "Send Email Invitations"}
              onPress={handleSendEmailInvitations}
              theme="primary"
              disabled={sendingEmails}
            />
          </View>
      </ScrollView>

      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        confirmText={modalConfirmText}
        cancelText={modalCancelText}
        onConfirm={modalOnConfirm}
        onCancel={hideModal}
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
    paddingVertical: theme.spacing.md,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },

  instructionCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  instructionText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  emailSection: {
    marginBottom: theme.spacing.xl,
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  emailInputContainer: {
    flex: 1,
  },
  removeButton: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  addEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  addEmailText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
