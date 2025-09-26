import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import InvitationModal from '@/components/InvitationModal';
import { theme } from '@/constants/theme';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resendVerificationEmail, signInUser } from '../services/auth/authService';

export default function LoginScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
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
  const [invitationModalVisible, setInvitationModalVisible] = useState(false);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [invitationInfo, setInvitationInfo] = useState<{
    groupName: string;
    inviterName: string;
  } | null>(null);

  // Load invitation info if invite token is present
  useEffect(() => {
    const loadInvitationInfo = async () => {
      if (invite) {
        try {
          console.log('Loading invitation details for token:', invite);
          // For now, we'll use a simple approach since getInvitationDetails might not be deployed yet
          setInvitationInfo({
            groupName: 'the group', // We'll get this from the invitation processing response
            inviterName: 'a team member',
          });
        } catch (error) {
          console.error('Error loading invitation info:', error);
          // If there's an error, remove the invite parameter
          router.replace('/login');
        }
      }
    };

    loadInvitationInfo();
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
      
      if (result.success) {
        // Reset resend button state on successful sign in
        setShowResendButton(false);
        // If there's an invitation token, show the invitation modal
        if (invite && invitationInfo) {
          setInvitationModalVisible(true);
        } else {
          // Navigate to main app (tabs)
          router.replace('/(tabs)');
        }
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

  const handleInvitationAccept = async () => {
    if (!invite || !invitationInfo) return;
    
    setInvitationLoading(true);
    
    try {
      console.log('Accepting invitation:', invite);
      const response = await fetch(`${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL}/processInvitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationToken: invite,
          userEmail: email.trim(),
        }),
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Invitation acceptance result:', result);

      if (result.success) {
        console.log('Successfully joined group!');
        setInvitationModalVisible(false);
        // Show success message before navigating
        setErrorMessage(`Successfully joined the group! Welcome!`);
        setErrorModalVisible(true);
        // Navigate after user closes the success message
      } else {
        console.error('Failed to accept invitation:', result.error);
        setErrorMessage(result.error || 'Failed to join group. Please try again.');
        setInvitationModalVisible(false);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setErrorMessage('An error occurred while joining the group. Please try again.');
      setInvitationModalVisible(false);
      setErrorModalVisible(true);
    } finally {
      setInvitationLoading(false);
    }
  };

  const handleInvitationReject = async () => {
    setInvitationModalVisible(false);
    // Navigate to main app without processing invitation
    router.replace('/(tabs)');
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

      {invitationInfo && (
        <InvitationModal
          visible={invitationModalVisible}
          groupName={invitationInfo.groupName}
          inviterName={invitationInfo.inviterName}
          onAccept={handleInvitationAccept}
          onReject={handleInvitationReject}
          loading={invitationLoading}
        />
      )}
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
