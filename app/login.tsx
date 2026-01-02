import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { functions } from '@/services/core/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// ✅ Using functional auth service per ARCHITECTURE.md
import { resendVerificationEmail, signInUser } from '../services/auth/authService';

export default function LoginScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  
  // Clean up expired invitations on component mount
  useEffect(() => {
    const cleanupExpiredInvitations = async () => {
      try {
        const storedInvitationString = await AsyncStorage.getItem('pendingInvitation');
        console.log('🧹 Cleanup check - AsyncStorage value:', storedInvitationString);
        
        if (storedInvitationString) {
          try {
            const storedInvitation = JSON.parse(storedInvitationString);
            if (storedInvitation.expiresAt && Date.now() > storedInvitation.expiresAt) {
              console.log('🧹 Cleaning up expired invitation token on app start');
              await AsyncStorage.removeItem('pendingInvitation');
            } else {
              console.log('🧹 Found valid stored invitation on app start');
            }
          } catch {
            // If parsing fails, it's probably an old format token, leave it for now
            console.log('🧹 Found legacy invitation format on app start');
          }
        } else {
          console.log('🧹 No stored invitation found during cleanup');
        }
      } catch (error) {
        console.error('❌ Error during invitation cleanup:', error);
      }
    };
    
    cleanupExpiredInvitations();
  }, []);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resendSuccessModalVisible, setResendSuccessModalVisible] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showResendButton, setShowResendButton] = useState(false);


  // Handle invitation tokens according to documented Phase 2/3 architecture
  useEffect(() => {
    const handleInvitationFlow = async () => {
      if (invite) {
        console.log('🔍 Processing invitation token with proper user detection');
        try {
          // Step 1: Validate invitation token
          const validateInvitationFunction = httpsCallable(functions, 'validateInvitationToken');
          const validationResult = await validateInvitationFunction({ invitationToken: invite });
          const validationData = validationResult.data as { success: boolean; isValid: boolean; invitationData?: any; error?: string };
          
          if (!validationData.success || !validationData.isValid || !validationData.invitationData) {
            console.warn('⚠️ Invalid invitation token:', validationData.error);
            return;
          }

          const invitation = validationData.invitationData;
          
          // Step 2: Check if user exists in Firestore (following architecture)
          console.log('🔍 Checking if user exists in Firestore for email:', invitation.email);
          const getUserByEmailFunction = httpsCallable(functions, 'getUserByEmail');
          const userLookupResult = await getUserByEmailFunction({ email: invitation.email });
          const userLookupData = userLookupResult.data as { success: boolean; userExists: boolean; userId?: string };
          
          if (userLookupData.success && userLookupData.userExists) {
            // Existing Firestore user - keep on login for immediate processing after login
            console.log('✅ Existing Firestore user found - staying on login page');
            
            // Store invitation for post-login processing  
            await AsyncStorage.setItem('pendingInvitation', JSON.stringify({
              token: invite,
              expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
              groupName: invitation.groupName || 'the group', 
              inviterName: invitation.inviterName || 'a team member',
              isExistingUser: true,
              userId: userLookupData.userId
            }));
            
            // Pre-fill email for convenience
            setEmail(invitation.email);
          } else {
            // Non-existing user - redirect to signup (Phase 2)
            console.log('� Non-existing user - redirecting to signup');
            
            // Mark invitation as clicked
            try {
              const markInvitationUsedFunction = httpsCallable(functions, 'markInvitationUsed');
              await markInvitationUsedFunction({
                invitationToken: invite,
                userId: null, // User doesn't exist yet
                status: 'clicked'
              });
              console.log('✅ Marked invitation as clicked');
            } catch (error) {
              console.error('❌ Error marking invitation as clicked:', error);
            }
            
            // Store invitation for post-signup processing
            await AsyncStorage.setItem('pendingInvitation', JSON.stringify({
              token: invite,
              expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
              groupName: invitation.groupName || 'the group',
              inviterName: invitation.inviterName || 'a team member', 
              isExistingUser: false
            }));
            
            router.replace(`/signup?invite=${encodeURIComponent(invite)}&email=${encodeURIComponent(invitation.email)}`);
            return;
          }
        } catch (error) {
          console.error('❌ Error processing invitation flow:', error);
        }
      }
    };

    handleInvitationFlow();
  }, [invite]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    let isValid = true;
    
    // Reset errors
    setEmailError('');
    setPasswordError('');

    // Validate email
    if (!email.trim()) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    // Validate password
    if (!password.trim()) {
      setPasswordError('Password is required');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      isValid = false;
    }

    return isValid;
  };

  const handleSignIn = async () => {
    if (!validateForm()) return;

    setLoading(true);
    
    try {
      const result = await signInUser(email.trim(), password);
      
      console.log('🔍 Sign in result:', {
        success: result.success,
        errorCode: result.error?.code,
        errorMessage: result.error?.message
      });
      
      if (result.success) {
        // Reset resend button state on successful sign in
        setShowResendButton(false);
        
        // Check for pending invitations after successful login
        try {
          const storedInvitationString = await AsyncStorage.getItem('pendingInvitation');
          if (storedInvitationString) {
            const storedInvitation = JSON.parse(storedInvitationString);
            console.log('🔍 Found pending invitation after login:', storedInvitation);
            
            if (storedInvitation.isExistingUser && storedInvitation.token) {
              console.log('✅ Processing invitation for existing user after login');
              
              // Add user to group using atomic functions
              const addMemberToGroupFunction = httpsCallable(functions, 'addMemberToGroup');
              const addMemberResult = await addMemberToGroupFunction({
                invitationToken: storedInvitation.token
              });
              const addMemberData = addMemberResult.data as { success: boolean; error?: string };
              
              if (addMemberData.success) {
                // Mark invitation as accepted
                const markInvitationUsedFunction = httpsCallable(functions, 'markInvitationUsed');
                await markInvitationUsedFunction({
                  invitationToken: storedInvitation.token,
                  userId: result.user?.uid || storedInvitation.userId,
                  status: 'accepted'
                });
                
                // Clear stored invitation
                await AsyncStorage.removeItem('pendingInvitation');
                
                console.log('✅ Successfully joined group after login');
                setErrorMessage(`✅ Successfully signed in and joined ${storedInvitation.groupName}!\n\nWelcome to your new group.`);
                setErrorModalVisible(true);
                return;
              } else {
                console.error('❌ Failed to add user to group:', addMemberData.error);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error processing pending invitation:', error);
        }
        
        console.log('✅ Login successful, navigating to main app');
        router.replace('/(tabs)');
      } else {
        // Show error
        let errorMessage = 'An error occurred. Please try again.';
        
        switch (result.error?.code) {
          case 'auth/user-not-found':
            errorMessage = 'No account found with this email address.';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password. Please try again.';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address.';
            break;
          case 'auth/email-not-verified':
            errorMessage = 'Please verify your email address before signing in.\n\nCheck your email inbox and click the verification link to activate your account. If you don\'t see the email, check your spam folder.';
            setShowResendButton(true);
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many failed attempts. Please try again later.';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection.';
            break;
          default:
            errorMessage = result.error?.message || errorMessage;
        }
        
        setErrorMessage(errorMessage);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };



  const handleCreateAccount = () => {
    // Reset resend button state when navigating to signup
    setShowResendButton(false);
    if (invite) {
      router.push(`/signup?invite=${encodeURIComponent(invite)}` as any);
    } else {
      router.push('/signup' as any);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address to resend verification.');
      setErrorModalVisible(true);
      return;
    }

    setResendLoading(true);
    
    try {
      const result = await resendVerificationEmail(email.trim());
      
      if (result.success) {
        // Show success modal instead of error modal
        setShowResendButton(false); // Hide resend button after successful send
        setResendSuccessModalVisible(true);
      } else {
        setErrorMessage(`❌ Failed to resend verification email.\n\n${result.error?.message || 'Please try again.'}`);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error('Resend error:', error);
      setErrorMessage('❌ An unexpected error occurred. Please try again.');
      setErrorModalVisible(true);
    } finally {
      setResendLoading(false);
    }
  };

  const handleCloseErrorModal = () => {
    setErrorModalVisible(false);
    // Only reset resend button state if it's a success message (verification email sent)
    if (errorMessage.includes('sent successfully')) {
      setShowResendButton(false);
    }
    // If it's a success message (contains "Successfully"), navigate to tabs
    if (errorMessage.includes('Successfully')) {
      router.replace('/(tabs)');
    }
    setErrorMessage('');
  };

  const handleCloseResendSuccessModal = () => {
    setResendSuccessModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to</Text>
            <Text style={styles.appName}>Sportnizer</Text>
            <Text style={styles.subtitle}>Sign in to manage your sports groups</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              error={emailError}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              autoCapitalize="none"
              error={passwordError}
            />

            <View style={styles.buttonContainer}>
              <Button
                label="Sign In"
                onPress={handleSignIn}
                theme="primary"
                loading={loading}
                disabled={loading}
              />

              {showResendButton && (
                <Button
                  label="Resend Verification Email"
                  onPress={handleResendVerification}
                  theme="secondary"
                  loading={resendLoading}
                  disabled={loading || resendLoading || !email.trim()}
                />
              )}

              <Button
                label="Create New Account"
                onPress={handleCreateAccount}
                theme="secondary"
                disabled={loading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={errorModalVisible}
        title="Sign In Error"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={handleCloseErrorModal}
        onCancel={handleCloseErrorModal}
        confirmButtonTheme="primary"
      />

      <ConfirmationModal
        visible={resendSuccessModalVisible}
        title="Verification Email Sent!"
        message={`📧 A new verification link has been sent to your email inbox.\n\nPlease check your email and click the verification link to activate your account.\n\nDon't forget to check your spam folder if you don't see the email.`}
        confirmText="OK"
        cancelText=""
        onConfirm={handleCloseResendSuccessModal}
        onCancel={handleCloseResendSuccessModal}
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.layout.containerPadding,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.normal,
  },
  appName: {
    fontSize: theme.typography.fontSize.xxlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    marginVertical: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  form: {
    width: '100%',
  },
  buttonContainer: {
    marginTop: theme.spacing.lg,
  },
});
