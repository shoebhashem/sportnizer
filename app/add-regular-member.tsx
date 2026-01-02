/**
 * ADD REGULAR MEMBER SCREEN
 * ========================
 * 
 * PURPOSE:
 * This screen allows club/group administrators to invite new regular members (adults) 
 * to join a specific group within a club. It implements Sportnizer's advanced 
 * two-path invitation workflow.
 * 
 * KEY FEATURES:
 * 1. Smart invitation routing based on user existence
 * 2. Multiple email input fields (up to 10 emails)
 * 3. Email validation and error handling
 * 4. Real-time status updates and user feedback
 * 5. Integration with the new invitation orchestration service
 * 
 * WORKFLOW:
 * 1. Admin enters email addresses of people to invite
 * 2. System checks if each email belongs to an existing Sportnizer user
 * 3. Existing users → get in-app notifications in their home tab
 * 4. New users → receive email invitations with Accept/Reject buttons
 * 5. Admin gets feedback on success/failure for each invitation
 */

// UI Components - Custom components for consistent design
import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';

// Styling and theming
import { theme } from '@/constants/theme';

// Authentication context to get current user info
import { useAuth } from '@/contexts/AuthContext';

// The main service that orchestrates the invitation workflow
// This is the NEW service that handles both existing and new users
import { addRegularMemberToGroupService } from '@/services/orchestration/addRegularMemberToGroup';

// Expo/React Native components and utilities
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';





/**
 * MAIN COMPONENT FUNCTION
 * =======================
 */
export default function AddRegularMemberScreen() {
  /**
   * NAVIGATION PARAMETERS
   * Get the group and club information passed from the previous screen
   * These are required to know which group we're adding members to
   */
  const { groupId, groupName, clubId, clubName } = useLocalSearchParams();
  
  /**
   * AUTHENTICATION
   * Get the current logged-in user info
   * We need this to know who is sending the invitations
   */
  const { user } = useAuth();
  
  /**
   * DEBUG LOGGING
   * Log all the navigation parameters and user info for debugging
   * This helps track down issues if invitations aren't working properly
   */
  React.useEffect(() => {
    console.log('🔍 AddRegularMember Navigation Params:', {
      groupId,
      groupName, 
      clubId,
      clubName,
      clubNameType: typeof clubName,
      clubNameValue: clubName
    });
    console.log('User auth status:', {
      user: !!user,
      uid: user?.uid,
      email: user?.email,
      displayName: user?.displayName,
    });
  }, [user, groupId, groupName, clubId, clubName]);
  
  /**
   * STATE MANAGEMENT
   * ===============
   */
  
  /**
   * EMAIL ADDRESSES STATE
   * Array of email addresses that the admin wants to invite
   * Starts with one empty string so there's always at least one input field
   */
  const [emailAddresses, setEmailAddresses] = useState<string[]>(['']);
  
  /**
   * LOADING STATE
   * Tracks whether we're currently sending invitations
   * Used to show loading spinner and prevent multiple submissions
   */
  const [sendingInvitations, setSendingInvitations] = useState(false);

  /**
   * MODAL STATE MANAGEMENT
   * ======================
   * These states control the confirmation modal that shows success/error messages
   */
  const [modalVisible, setModalVisible] = useState(false);        // Whether modal is shown
  const [modalTitle, setModalTitle] = useState('');              // Modal title text
  const [modalMessage, setModalMessage] = useState('');          // Modal body message
  const [modalConfirmText, setModalConfirmText] = useState('OK'); // Text for confirm button
  const [modalCancelText, setModalCancelText] = useState('');    // Text for cancel button (optional)
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(() => () => {}); // Function to call when confirmed

  /**
   * UTILITY FUNCTIONS
   * =================
   */
  
  /**
   * SHOW MODAL HELPER
   * Configures and displays the modal with custom title, message, and buttons
   * 
   * @param title - The modal title
   * @param message - The modal message body
   * @param confirmText - Text for the confirm button (default: "OK")
   * @param cancelText - Text for cancel button (empty = no cancel button)
   * @param onConfirm - Function to execute when confirmed (optional)
   */
  const showModal = (title: string, message: string, confirmText = 'OK', cancelText = '', onConfirm?: () => void) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalCancelText(cancelText);
    setModalOnConfirm(() => onConfirm ? onConfirm : hideModal);
    setModalVisible(true);
  };

  /**
   * HIDE MODAL HELPER
   * Simply hides the modal by setting visibility to false
   */
  const hideModal = () => {
    setModalVisible(false);
  };

  /**
   * EMAIL FIELD MANAGEMENT
   * ======================
   */
  
  /**
   * ADD EMAIL FIELD
   * Adds a new empty email input field to the list
   * Limit: Maximum 10 email addresses can be entered at once
   */
  const addEmailField = () => {
    if (emailAddresses.length < 10) { // Prevent too many fields for UX reasons
      setEmailAddresses([...emailAddresses, '']);
    }
  };

  /**
   * REMOVE EMAIL FIELD
   * Removes an email input field at the specified index
   * Minimum: Always keep at least one field available
   * 
   * @param index - The index of the email field to remove
   */
  const removeEmailField = (index: number) => {
    if (emailAddresses.length > 1) { // Always keep at least one field
      const newEmails = emailAddresses.filter((_, i) => i !== index);
      setEmailAddresses(newEmails);
    }
  };

  /**
   * UPDATE EMAIL VALUE
   * Updates the email address at a specific index when user types
   * 
   * @param index - Which email field is being updated
   * @param email - The new email value
   */
  const updateEmail = (index: number, email: string) => {
    const newEmails = [...emailAddresses]; // Create a copy to avoid mutating state
    newEmails[index] = email;
    setEmailAddresses(newEmails);
  };

  /**
   * EMAIL VALIDATION
   * ================
   * Validates all entered email addresses and returns only valid ones
   * Shows error modal if any emails are invalid
   * 
   * @returns Array of valid email addresses, or empty array if validation fails
   */
  const validateEmails = (): string[] => {
    // Step 1: Clean up emails - remove whitespace and filter out empty fields
    const validEmails = emailAddresses
      .map(email => email.trim())      // Remove leading/trailing whitespace
      .filter(email => email.length > 0); // Remove empty fields
    
    // Step 2: Check email format using regex
    // This regex checks for basic email format: something@something.something
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = validEmails.filter(email => !emailRegex.test(email));
    
    // Step 3: If any emails are invalid, show error and return empty array
    if (invalidEmails.length > 0) {
      showModal('Invalid Emails', `Please check these email addresses:\n${invalidEmails.join('\n')}`);
      return []; // Return empty array to prevent submission
    }
    
    // Step 4: Return all valid emails if validation passes
    return validEmails;
  };

  /**
   * MAIN INVITATION HANDLER
   * =======================
   * This is the heart of the invitation system. It orchestrates the entire workflow:
   * 1. Validates email addresses
   * 2. Calls the invitation service 
   * 3. Processes the results
   * 4. Shows appropriate success/error messages
   */
  const handleSendInvitations = async () => {
    // Step 1: Validate all email addresses
    const validEmails = validateEmails();
    if (validEmails.length === 0) {
      showModal('No Valid Emails', 'Please enter at least one valid email address.');
      return;
    }

    // Step 2: Check if user is authenticated
    if (!user) {
      showModal('Error', 'Unable to send invitations. Please make sure you are properly logged in.');
      return;
    }

    // Step 3: Show loading state
    setSendingInvitations(true);

    try {
      /**
       * CALL THE INVITATION SERVICE
       * ===========================
       * This calls our new invitation orchestrator service that:
       * - Checks if each email belongs to an existing Sportnizer user
       * - For existing users: adds invitation to their groupInvites[] array (in-app notification)
       * - For new users: sends email invitation with Accept/Reject buttons
       * - Returns detailed results for each email processed
       */
      const result = await addRegularMemberToGroupService.inviteUsersToGroup({
        emails: validEmails,                                          // List of emails to invite
        clubId: clubId as string,                                    // Which club
        clubName: clubName as string,                                // Club name for display
        groupId: groupId as string,                                  // Which group within the club
        groupName: groupName as string,                              // Group name for display
        inviterName: user.displayName || user.email || 'Unknown User', // Who is sending the invitation
        inviterUid: user.uid,                                        // Inviter's user ID
      });

      // Log the result for debugging
      console.log('📧 Invitation workflow result:', result);

      /**
       * PROCESS INVITATION RESULTS
       * ==========================
       * The service returns detailed results for each email. We need to:
       * 1. Count successes and failures
       * 2. Categorize results by type (in-app notification vs email invitation)
       * 3. Build appropriate success/error messages
       * 4. Show user feedback
       */
      if (result.success) {
        // Count different types of results
        const successCount = result.results?.filter((r: any) => r.success).length || 0;
        const failureCount = result.results?.filter((r: any) => !r.success).length || 0;
        const failedResults = result.results?.filter((r: any) => !r.success) || [];
        
        // Categorize successful invitations by type:
        // - 'in_app_notification': Existing users who got notified in their app
        // - 'email_invitation': New users who got email invitations
        const inAppNotifications = result.results?.filter((r: any) => r.success && r.action === 'in_app_notification').length || 0;
        const emailsSent = result.results?.filter((r: any) => r.success && r.action === 'email_invitation').length || 0;
        
        // Log statistics for debugging
        console.log('📊 Invitation workflow stats:', { successCount, failureCount, inAppNotifications, emailsSent, failedResults });
        
        /**
         * BUILD SUCCESS MESSAGE
         * Different messages based on what happened:
         * - In-app notifications for existing users
         * - Email invitations for new users
         * - Combination of both
         */
        let message = '';
        if (inAppNotifications > 0) {
          message += `Successfully notified ${inAppNotifications} existing user(s) - they will see the invitation in their app`;
        }
        if (emailsSent > 0) {
          if (message) message += '\n'; // Add line break if we already have a message
          message += `Successfully sent ${emailsSent} invitation email(s) to new users`;
        }
        if (!message) {
          message = 'Operation completed'; // Fallback message
        }
        
        /**
         * ADD FAILURE INFORMATION (if any)
         * If some invitations failed, append error details to the message
         */
        if (failureCount > 0) {
          message += `\n\n${failureCount} invitation(s) failed`;
          
          // Add specific error details for each failed invitation
          if (failedResults.length > 0) {
            message += '\n\nErrors:';
            failedResults.forEach((failed, index) => {
              const errorMsg = failed.error || 'Unknown error';
              message += `\n• ${failed.email}: ${errorMsg}`;
            });
          }
        }
        
        /**
         * DETERMINE MODAL TITLE
         * Choose appropriate title based on results:
         * - "Partially Completed" if some failed
         * - "Notifications Sent" if in-app notifications were sent
         * - "Invitations Sent" if emails were sent
         */
        const title = failureCount > 0 ? 'Partially Completed' : (inAppNotifications > 0 ? 'Notifications Sent' : 'Invitations Sent');
        
        /**
         * SHOW SUCCESS MODAL WITH NAVIGATION
         * Show the results to the user and navigate back when they confirm
         */
        showModal(title, message, 'OK', '', () => {
          hideModal();
          router.back(); // Return to previous screen after successful operation
        });
        
        /**
         * CLEAR FORM IF FULLY SUCCESSFUL
         * Only clear the email fields if all invitations succeeded
         * If some failed, keep the form so user can retry failed emails
         */
        if (failureCount === 0) {
          setEmailAddresses(['']); // Reset to single empty field
        }
      } else {
        /**
         * HANDLE SERVICE-LEVEL FAILURE
         * If the entire service call failed (not individual email failures)
         */
        console.error('❌ Failed to add members:', result.error);
        showModal('Error', result.error || 'Failed to add members to group');
      }
    } catch (error: any) {
      /**
       * HANDLE NETWORK/SYSTEM ERRORS
       * ============================
       * Catch and handle various types of errors that might occur:
       * - Authentication errors
       * - Permission errors  
       * - Network timeouts
       * - Service unavailable
       * - Unknown errors
       */
      console.error('❌ Error adding members to group:', error);
      
      let errorMessage = 'Failed to add members to group. Please try again.';
      
      // Check for specific Firebase Function error codes and provide helpful messages
      if (error.code) {
        switch (error.code) {
          case 'functions/unauthenticated':
            errorMessage = 'Authentication error. Please sign out and sign back in.';
            break;
          case 'functions/permission-denied':
            errorMessage = 'You do not have permission to add members to this group.';
            break;
          case 'functions/unavailable':
            errorMessage = 'Member addition service is currently unavailable. Please try again later.';
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
      /**
       * CLEANUP
       * Always hide loading state when operation completes (success or failure)
       */
      setSendingInvitations(false);
    }
  };



  /**
   * MAIN RENDER FUNCTION
   * ====================
   * Renders the complete UI for the invitation screen
   */
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HEADER SECTION */}
        <View style={styles.header}>
          {/* Back Button */}
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          
          {/* Title and Description */}
          <Text style={styles.title}>Add Regular Member</Text>
          <Text style={styles.subtitle}>
            Invite adults to join {groupName || 'this group'}. Existing users will get in-app notifications, new users will receive email invitations.
          </Text>
        </View>

        {/* MAIN CONTENT SECTION */}
        <View>
          {/* Information Card - Explains how the system works */}
          <View style={styles.instructionCard}>
            <Ionicons name="people" size={24} color={theme.colors.secondary} />
            <Text style={styles.instructionText}>
              Enter email addresses to invite users. Existing Sportnizer users will receive in-app notifications, while new users will get email invitations with Accept/Reject buttons.
            </Text>
          </View>

          {/* EMAIL INPUT SECTION */}
          <View style={styles.emailSection}>
            <Text style={styles.sectionTitle}>Email Addresses</Text>
            
            {/* Dynamic Email Input Fields */}
            {/* Map through emailAddresses array to create input fields */}
            {emailAddresses.map((email, index) => (
              <View key={index} style={styles.emailInputRow}>
                {/* Email Input Field */}
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
                
                {/* Remove Button (only show if more than 1 field) */}
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

            {/* Add Email Button (only show if less than 10 fields) */}
            {emailAddresses.length < 10 && (
              <TouchableOpacity style={styles.addEmailButton} onPress={addEmailField}>
                <Ionicons name="add-circle" size={20} color={theme.colors.secondary} />
                <Text style={styles.addEmailText}>Add another email</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* SUBMIT BUTTON */}
          {/* Shows loading state and is disabled during submission */}
          <Button
            label={sendingInvitations ? "Sending Invitations..." : "Send Invitations"}
            onPress={handleSendInvitations}
            theme="primary"
            disabled={sendingInvitations}
          />
        </View>
      </ScrollView>

      {/* MODAL FOR SUCCESS/ERROR MESSAGES */}
      {/* This modal shows results after invitation attempt */}
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

/**
 * STYLESHEET
 * ==========
 * Defines all the styling for the component
 * Uses the app's theme system for consistent colors, spacing, and typography
 */
const styles = StyleSheet.create({
  // Main container that fills the screen
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  
  // ScrollView content styling with padding
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.md,
  },
  
  // Header section spacing
  header: {
    marginBottom: theme.spacing.xl,
  },
  
  // Back button styling with padding for touch target
  backButton: {
    alignSelf: 'flex-start',
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  
  // Main title text styling
  title: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  
  // Subtitle text styling
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },

  // Information card styling with background and spacing
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  
  // Text inside the instruction card
  instructionText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
  },
  
  // Section title styling (e.g., "Email Addresses")
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  
  // Email section container spacing
  emailSection: {
    marginBottom: theme.spacing.xl,
  },
  
  // Row containing email input and remove button
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  
  // Container for email input field (takes most space)
  emailInputContainer: {
    flex: 1,
  },
  
  // Remove button styling with padding for touch target
  removeButton: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  
  // "Add another email" button styling
  addEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  
  // Text for "Add another email" button
  addEmailText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
