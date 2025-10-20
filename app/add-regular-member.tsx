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
    Clipboard,
    ScrollView,
    Share,
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

interface ShareableInviteResult {
  success: boolean;
  inviteToken?: string;
  inviteLink?: string;
  expiresAt?: string;
  error?: string;
}

export default function AddRegularMemberScreen() {
  const { groupId, groupName } = useLocalSearchParams();
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
  
  // State for shareable link
  const [shareableLink, setShareableLink] = useState<string>('');
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkExpiration, setLinkExpiration] = useState<string>('');
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'email' | 'link'>('email');

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
        groupId: groupId as string,
        groupName: groupName as string,
        inviterName: user.displayName || user.email || 'Unknown User',
      });

      if (result.data.success) {
        const successCount = result.data.results?.filter(r => r.success).length || 0;
        const failureCount = result.data.results?.filter(r => !r.success).length || 0;
        
        let message = `Successfully sent ${successCount} invitation(s)`;
        if (failureCount > 0) {
          message += `\n${failureCount} invitation(s) failed to send`;
        }
        
        showModal('Invitations Sent', message, 'OK', '', () => {
          hideModal();
          router.back();
        });
        
        // Clear email fields on success
        setEmailAddresses(['']);
      } else {
        showModal('Error', result.data.error || 'Failed to send invitations');
      }
    } catch (error: any) {
      console.error('Error sending email invitations:', error);
      showModal('Error', 'Failed to send invitations. Please try again.');
    } finally {
      setSendingEmails(false);
    }
  };

  const handleGenerateShareableLink = async () => {
    if (!user) {
      showModal('Error', 'Unable to generate link. Please make sure you are properly logged in.');
      return;
    }

    setGeneratingLink(true);

    try {
      const generateShareableInvite = httpsCallable<any, ShareableInviteResult>(
        functions,
        'generateShareableInvite'
      );

      const result = await generateShareableInvite({
        groupId: groupId as string,
        groupName: groupName as string,
        inviterName: user.displayName || user.email || 'Unknown User',
        inviterUid: user.uid,
        expirationDays: 7, // Default to 7 days
        invitationType: 'group-member'
      });

      if (result.data.success && result.data.inviteLink) {
        setShareableLink(result.data.inviteLink);
        setLinkExpiration(result.data.expiresAt || '');
        
        showModal(
          'Link Generated',
          'Your shareable invitation link has been generated successfully!'
        );
      } else {
        showModal('Error', result.data.error || 'Failed to generate shareable link');
      }
    } catch (error: any) {
      console.error('Error generating shareable link:', error);
      showModal('Error', 'Failed to generate shareable link. Please try again.');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (shareableLink) {
      await Clipboard.setString(shareableLink);
      showModal('Copied', 'Invitation link copied to clipboard!');
    }
  };

  const handleShareLink = async () => {
    if (shareableLink) {
      try {
        await Share.share({
          message: `Join our ${groupName} group! Click this link to join: ${shareableLink}`,
          url: shareableLink,
          title: `Join ${groupName}`,
        });
      } catch (error) {
        console.error('Error sharing link:', error);
      }
    }
  };

  const formatExpirationDate = (isoString: string): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
            Invite adults to join {groupName || 'this group'}
          </Text>
        </View>

        {/* Tab Selection */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'email' && styles.activeTab]}
            onPress={() => setActiveTab('email')}
          >
            <Ionicons 
              name="mail" 
              size={20} 
              color={activeTab === 'email' ? theme.colors.primary : theme.colors.textSecondary} 
            />
            <Text style={[styles.tabText, activeTab === 'email' && styles.activeTabText]}>
              Email Invitation
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'link' && styles.activeTab]}
            onPress={() => setActiveTab('link')}
          >
            <Ionicons 
              name="link" 
              size={20} 
              color={activeTab === 'link' ? theme.colors.primary : theme.colors.textSecondary} 
            />
            <Text style={[styles.tabText, activeTab === 'link' && styles.activeTabText]}>
              Shareable Link
            </Text>
          </TouchableOpacity>
        </View>

        {/* Email Invitation Tab */}
        {activeTab === 'email' && (
          <View style={styles.tabContent}>
            <View style={styles.instructionCard}>
              <Ionicons name="information-circle" size={24} color={theme.colors.secondary} />
              <Text style={styles.instructionText}>
                Enter email addresses to send personal invitations. Recipients will receive an email with a link to join the group.
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
        )}

        {/* Shareable Link Tab */}
        {activeTab === 'link' && (
          <View style={styles.tabContent}>
            <View style={styles.instructionCard}>
              <Ionicons name="information-circle" size={24} color={theme.colors.secondary} />
              <Text style={styles.instructionText}>
                Generate a shareable link that you can send via WhatsApp, Messenger, or any other app. The link works for multiple people and expires in 7 days.
              </Text>
            </View>

            {!shareableLink ? (
              <Button
                label={generatingLink ? "Generating Link..." : "Generate Shareable Link"}
                onPress={handleGenerateShareableLink}
                theme="primary"
                disabled={generatingLink}
              />
            ) : (
              <View style={styles.linkSection}>
                <Text style={styles.sectionTitle}>Your Shareable Link</Text>
                
                <View style={styles.linkContainer}>
                  <Text style={styles.linkText} numberOfLines={3}>
                    {shareableLink}
                  </Text>
                </View>

                {linkExpiration && (
                  <Text style={styles.expirationText}>
                    Expires: {formatExpirationDate(linkExpiration)}
                  </Text>
                )}

                <View style={styles.linkActions}>
                  <Button
                    label="Copy Link"
                    onPress={handleCopyLink}
                    theme="secondary"
                  />
                  <Button
                    label="Share Link"
                    onPress={handleShareLink}
                    theme="primary"
                  />
                </View>

                <TouchableOpacity
                  style={styles.generateNewButton}
                  onPress={() => {
                    setShareableLink('');
                    setLinkExpiration('');
                  }}
                >
                  <Text style={styles.generateNewText}>Generate New Link</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: 4,
    marginBottom: theme.spacing.xl,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
    gap: theme.spacing.sm,
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  activeTabText: {
    color: theme.colors.primary,
  },
  tabContent: {
    flex: 1,
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
  linkSection: {
    gap: theme.spacing.lg,
  },
  linkContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  linkText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontFamily: 'monospace',
  },
  expirationText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: -theme.spacing.sm,
  },
  linkActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  generateNewButton: {
    alignSelf: 'center',
    padding: theme.spacing.md,
  },
  generateNewText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    textDecorationLine: 'underline',
  },
});
