import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { auth, functions } from '@/services/core/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { signUpUser } from '../services/auth/authService';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface GroupInvitationDetails {
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterEmail: string;
  token: string;
  isValid: boolean;
  isExpired: boolean;
  isUsed: boolean;
  email: string;
}

export default function GroupInviteScreen() {
  const { token } = useLocalSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [invitationDetails, setInvitationDetails] = useState<GroupInvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  
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
  
  // Form state for authentication
  const [isExistingUser, setIsExistingUser] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const fetchInvitationDetails = useCallback(async () => {
    if (!token) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Call Firebase function to get invitation details
      const response = await fetch(`https://europe-north1-sportnizer.cloudfunctions.net/getInvitationDetails?token=${token}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch invitation details');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        setError(data.error || 'Failed to load invitation details');
      } else if (data.invitation) {
        // Transform the response to match our expected format
        const invitation = data.invitation;
        const transformedData: GroupInvitationDetails = {
          groupId: invitation.groupId,
          groupName: invitation.groupName,
          inviterName: invitation.inviterName,
          inviterEmail: invitation.email,
          token: token as string,
          isValid: true,
          isExpired: invitation.expiresAt && new Date(invitation.expiresAt) < new Date(),
          isUsed: invitation.used || false,
          email: invitation.email
        };
        
        setInvitationDetails(transformedData);
        setEmail(invitation.email); // Pre-fill the email
        
        if (transformedData.isExpired) {
          setError('This invitation has expired');
        } else if (transformedData.isUsed) {
          setError('This invitation has already been used');
        }
      } else {
        setError('Invalid invitation details');
      }
    } catch (error) {
      console.error('Error fetching invitation details:', error);
      setError('Failed to load invitation details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitationDetails();
  }, [fetchInvitationDetails]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      // Refresh invitation details after sign out
      await fetchInvitationDetails();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const validateForm = () => {
    console.log('🔍 Validating form:', {
      user: !!user,
      isExistingUser,
      email,
      password,
      fullName
    });
    
    // If user is already logged in, no validation needed for auth fields
    if (user) {
      console.log('✅ User already logged in, skipping auth validation');
      return true;
    }
    
    if (!isExistingUser) {
      if (!fullName?.trim()) {
        showModal('Error', 'Please enter your full name');
        return false;
      }
      if (!email?.trim()) {
        showModal('Error', 'Please enter your email address');
        return false;
      }
      if (!password) {
        showModal('Error', 'Please enter a password');
        return false;
      }
      if (password !== confirmPassword) {
        showModal('Error', 'Passwords do not match');
        return false;
      }
      if (password.length < 6) {
        showModal('Error', 'Password must be at least 6 characters long');
        return false;
      }
    } else {
      if (!email?.trim()) {
        showModal('Error', 'Please enter your email address');
        return false;
      }
      if (!password) {
        showModal('Error', 'Please enter your password');
        return false;
      }
    }
    
    console.log('✅ Form validation passed');
    return true;
  };

  const handleAcceptInvitation = async () => {
    console.log('🚀 Accept Invitation button clicked!');
    
    if (!validateForm()) return;
    if (!invitationDetails) return;

    setProcessing(true);

    try {
      let authUser = user;

      // If no user is logged in, handle authentication
      if (!authUser) {
        if (isExistingUser) {
          // Sign in existing user
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
          );
          authUser = userCredential.user;
        } else {
          // Create new user account using the same flow as signup.tsx
          const result = await signUpUser(email.trim(), password, fullName.trim());
          
          if (!result.success) {
            throw new Error(result.error?.message || 'Failed to create account');
          }
          
          // Process invitation immediately after signup (before email verification)
          console.log('Processing invitation for new user:', email.trim());
          const processInvitationFunction = httpsCallable(functions, 'processInvitation');
          const invitationResult = await processInvitationFunction({ 
            invitationToken: token,
            userEmail: email.trim()
          });
          
          if (!(invitationResult.data as any)?.success) {
            console.error('Failed to process invitation:', invitationResult.data);
            throw new Error('Failed to process invitation');
          }
          
          // Show success message and redirect to login
          showModal(
            'Account Created!',
            `Account created successfully! You have also been added to ${invitationDetails.groupName}.\n\nPlease check your email inbox and click the verification link to activate your account. You must verify your email before you can sign in.`,
            'Go to Sign In',
            '',
            () => {
              hideModal();
              router.replace('/login');
            }
          );
          return; // Exit early for new users
        }
      }

      // Process the group invitation for existing users only
      console.log('Sending group invitation processing request for existing user:', {
        invitationToken: token,
        userEmail: authUser.email,
        action: 'accept'
      });
      
      const response = await fetch('https://europe-north1-sportnizer.cloudfunctions.net/respondToInvitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationToken: token,
          userEmail: authUser.email,
          action: 'accept'
        })
      });

      console.log('Group invitation response status:', response.status);
      const result = await response.json();
      console.log('Group invitation response:', result);

      if (result.success) {
        console.log('🎉 SUCCESS! Group invitation accepted successfully');
        
        showModal(
          'Welcome!',
          `You have successfully joined ${invitationDetails.groupName}!\n\nYou can now participate in group activities. The group should appear in your groups list.`,
          'View Groups',
          '',
          () => {
            hideModal();
            // Navigate to the home tab
            router.replace('/');
          }
        );
      } else {
        console.error('Group invitation failed:', result);
        showModal('Error', result.error || 'Failed to accept invitation. Please try again.');
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      if (error instanceof Error && error.message.includes('auth/')) {
        // Firebase Auth error
        let errorMessage = 'Authentication failed. ';
        if (error.message.includes('user-not-found')) {
          errorMessage += 'No account found with this email. Please create a new account.';
        } else if (error.message.includes('wrong-password')) {
          errorMessage += 'Incorrect password. Please try again.';
        } else if (error.message.includes('email-already-in-use')) {
          errorMessage += 'An account with this email already exists. Please sign in instead.';
        } else {
          errorMessage += error.message;
        }
        showModal('Authentication Error', errorMessage);
      } else {
        showModal('Error', 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectInvitation = async () => {
    if (!invitationDetails || !user) {
      router.replace('/');
      return;
    }

    try {
      const response = await fetch('https://europe-north1-sportnizer.cloudfunctions.net/respondToInvitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationToken: token,
          userEmail: user.email,
          action: 'reject'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        showModal('Invitation Declined', 'You have declined the invitation.', 'OK', '', () => {
          hideModal();
          router.replace('/');
        });
      } else {
        console.error('Failed to decline invitation:', result);
        router.replace('/');
      }
    } catch (error) {
      console.error('Error declining invitation:', error);
      router.replace('/');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading invitation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={64} color={theme.colors.error} />
          <Text style={styles.errorTitle}>Invalid Invitation</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Button
            label="Go to Home"
            onPress={() => router.replace('/')}
            theme="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!invitationDetails) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.errorTitle}>No Invitation Found</Text>
          <Text style={styles.errorText}>The invitation details could not be loaded.</Text>
          <Button
            label="Go to Home"
            onPress={() => router.replace('/')}
            theme="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  // If user is already logged in but it's a different account
  const isWrongAccount = user && user.email !== invitationDetails.email;

  return (
    <>
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="people-outline" size={80} color={theme.colors.secondary} />
          </View>
          <Text style={styles.title}>Group Invitation</Text>
          <Text style={styles.subtitle}>
            You&apos;ve been invited to join {invitationDetails.groupName}
          </Text>
        </View>

        <View style={styles.invitationCard}>
          <View style={styles.invitationHeader}>
            <Text style={styles.cardTitle}>Invitation Details</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Group:</Text>
            <Text style={styles.detailValue}>{invitationDetails.groupName}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Invited by:</Text>
            <Text style={styles.detailValue}>{invitationDetails.inviterName}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email:</Text>
            <Text style={styles.detailValue}>{invitationDetails.email}</Text>
          </View>
        </View>

        {/* Wrong account warning */}
        {isWrongAccount && (
          <View style={styles.warningCard}>
            <Ionicons name="warning" size={24} color={theme.colors.error} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Different Account</Text>
              <Text style={styles.warningText}>
                You&apos;re signed in as {user?.email}, but this invitation is for {invitationDetails.email}. 
                You may want to sign out and use the correct account.
              </Text>
              <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Authentication section */}
        {!user && (
          <View style={styles.authSection}>
            <Text style={styles.authTitle}>Account</Text>
            
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleButton, isExistingUser && styles.toggleButtonActive]}
                onPress={() => setIsExistingUser(true)}
              >
                <Text style={[styles.toggleText, isExistingUser && styles.toggleTextActive]}>
                  Existing Account
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, !isExistingUser && styles.toggleButtonActive]}
                onPress={() => setIsExistingUser(false)}
              >
                <Text style={[styles.toggleText, !isExistingUser && styles.toggleTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {!isExistingUser && (
              <Input
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
              />
            )}

            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
            />

            {!isExistingUser && (
              <Input
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                secureTextEntry
              />
            )}
          </View>
        )}

        <View style={styles.actions}>
          <Button
            label={processing ? "Processing..." : user ? "Accept Invitation" : (isExistingUser ? "Sign In & Accept" : "Create Account & Accept")}
            onPress={handleAcceptInvitation}
            theme="primary"
            disabled={processing}
          />
          
          <TouchableOpacity
            style={styles.declineButton}
            onPress={handleRejectInvitation}
          >
            <Text style={styles.declineText}>Decline Invitation</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  invitationCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  invitationHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  detailLabel: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  detailValue: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningContent: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: '#856404',
    marginBottom: 4,
  },
  warningText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  signOutButton: {
    alignSelf: 'flex-start',
  },
  signOutText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    textDecorationLine: 'underline',
  },
  authSection: {
    marginBottom: 32,
  },
  authTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.secondary,
  },
  toggleText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  toggleTextActive: {
    color: theme.colors.white,
  },
  actions: {
    paddingBottom: 32,
  },
  declineButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  declineText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
});