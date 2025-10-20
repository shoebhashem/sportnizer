import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { getFunctionsUrl } from '@/constants/config';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/services/core/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface GroupInvitationDetails {
  invitationType: 'email' | 'shareable';
  groupId: string;
  groupName: string;
  inviterName: string;
  createdAt: any;
  
  // Email invitation specific
  email?: string;
  
  // Shareable invitation specific
  expiresAt?: any;
  maxUses?: number | null;
  currentUses?: number;
  invitationSubType?: string;
  
  // Group info
  groupInfo?: {
    sportType: string;
    description?: string;
    memberCount: number;
    isActive: boolean;
  };
}

export default function JoinScreen() {
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
  
  // Form state for authentication
  const [isExistingUser, setIsExistingUser] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

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

  const fetchInvitationDetails = useCallback(async () => {
    if (!token) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const functionsUrl = getFunctionsUrl();
      const response = await fetch(`${functionsUrl}/getInvitationDetails?token=${token}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch invitation details');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        setError(data.error || 'Failed to load invitation details');
      } else if (data.invitation) {
        setInvitationDetails(data.invitation);
        
        // Pre-fill email for email invitations
        if (data.invitation.invitationType === 'email' && data.invitation.email) {
          setEmail(data.invitation.email);
        }
      } else {
        setError('Invalid invitation data');
      }
    } catch (error: any) {
      console.error('Error fetching invitation details:', error);
      setError('Failed to load invitation details. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitationDetails();
  }, [fetchInvitationDetails]);

  const handleJoinGroup = async () => {
    if (!invitationDetails || !user) return;

    setProcessing(true);

    try {
      const functionsUrl = getFunctionsUrl();
      const response = await fetch(`${functionsUrl}/processInvitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationToken: token,
          userEmail: user.email,
        }),
      });

      const result = await response.json();

      if (result.success) {
        showModal(
          'Welcome!',
          `You have successfully joined ${invitationDetails.groupName}!`,
          'Go to Groups',
          '',
          () => {
            hideModal();
            router.replace('/(tabs)/groups');
          }
        );
      } else {
        showModal('Error', result.error || 'Failed to join group. Please try again.');
      }
    } catch (error: any) {
      console.error('Error joining group:', error);
      showModal('Error', 'Failed to join group. Please check your internet connection and try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      showModal('Missing Information', 'Please enter both email and password.');
      return;
    }

    setProcessing(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // User will be signed in, and useAuth will update automatically
      // Then we can proceed to join the group
    } catch (error: any) {
      let errorMessage = 'Sign in failed. Please try again.';
      
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = 'Invalid email or password. Please check your credentials.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
      }
      
      showModal('Sign In Failed', errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleSignUp = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      showModal('Missing Information', 'Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      showModal('Password Mismatch', 'Passwords do not match. Please try again.');
      return;
    }

    if (password.length < 6) {
      showModal('Password Too Short', 'Password must be at least 6 characters long.');
      return;
    }

    setProcessing(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      
      // Update the user's display name
      await updateProfile(userCredential.user, {
        displayName: fullName.trim(),
      });

      // User is now signed up and signed in automatically
      // The useAuth hook will update and we can proceed to join the group
    } catch (error: any) {
      let errorMessage = 'Sign up failed. Please try again.';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists. Please sign in instead.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password is too weak. Please choose a stronger password.';
          break;
      }
      
      showModal('Sign Up Failed', errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleSwitchUser = () => {
    showModal(
      'Switch Account',
      'You are currently signed in as a different user. Would you like to sign out and use a different account?',
      'Sign Out',
      'Cancel',
      async () => {
        try {
          await auth.signOut();
          hideModal();
        } catch (error) {
          console.error('Error signing out:', error);
          showModal('Error', 'Failed to sign out. Please try again.');
        }
      }
    );
  };

  const formatExpirationDate = (timestamp: any): string => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMemberCount = (count: number): string => {
    if (count === 1) return '1 member';
    return `${count} members`;
  };

  // Auto-join if user is already signed in and email matches (for email invitations)
  useEffect(() => {
    if (user && invitationDetails && !processing) {
      if (invitationDetails.invitationType === 'shareable' || 
          (invitationDetails.invitationType === 'email' && user.email === invitationDetails.email)) {
        // For shareable invitations or matching email invitations, we can proceed automatically
        // But let's show the group details first and let them confirm
      }
    }
  }, [user, invitationDetails, processing]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading invitation details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={theme.colors.error} />
          <Text style={styles.errorTitle}>Invitation Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Button
            label="Try Again"
            onPress={fetchInvitationDetails}
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
          <Text style={styles.errorText}>The invitation link appears to be invalid or expired.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Group Information */}
        <View style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <Ionicons name="people" size={32} color={theme.colors.secondary} />
            <View style={styles.groupInfo}>
              <Text style={styles.groupName}>{invitationDetails.groupName}</Text>
              {invitationDetails.groupInfo && (
                <>
                  <Text style={styles.groupSport}>{invitationDetails.groupInfo.sportType}</Text>
                  <Text style={styles.memberCount}>
                    {formatMemberCount(invitationDetails.groupInfo.memberCount)}
                  </Text>
                </>
              )}
            </View>
          </View>

          {invitationDetails.groupInfo?.description && (
            <Text style={styles.groupDescription}>{invitationDetails.groupInfo.description}</Text>
          )}

          <View style={styles.inviterInfo}>
            <Ionicons name="person" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.inviterText}>Invited by {invitationDetails.inviterName}</Text>
          </View>

          {/* Invitation Type Badge */}
          <View style={styles.invitationBadge}>
            <Text style={styles.badgeText}>
              {invitationDetails.invitationType === 'email' ? 'Email Invitation' : 'Shareable Link'}
            </Text>
          </View>

          {/* Expiration info for shareable links */}
          {invitationDetails.invitationType === 'shareable' && invitationDetails.expiresAt && (
            <View style={styles.expirationInfo}>
              <Ionicons name="time" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.expirationText}>
                Expires: {formatExpirationDate(invitationDetails.expiresAt)}
              </Text>
            </View>
          )}
        </View>

        {/* Authentication Section */}
        {!user ? (
          <View style={styles.authSection}>
            <Text style={styles.authTitle}>Join {invitationDetails.groupName}</Text>
            <Text style={styles.authSubtitle}>
              {invitationDetails.invitationType === 'email' 
                ? 'Sign in or create an account to join this group'
                : 'Sign in or create an account to accept this invitation'
              }
            </Text>

            {/* Toggle between Sign In and Sign Up */}
            <View style={styles.authToggle}>
              <TouchableOpacity
                style={[styles.toggleButton, isExistingUser && styles.activeToggle]}
                onPress={() => setIsExistingUser(true)}
              >
                <Text style={[styles.toggleText, isExistingUser && styles.activeToggleText]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, !isExistingUser && styles.activeToggle]}
                onPress={() => setIsExistingUser(false)}
              >
                <Text style={[styles.toggleText, !isExistingUser && styles.activeToggleText]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Form */}
            {isExistingUser ? (
              <View style={styles.authForm}>
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
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
                <Button
                  label={processing ? "Signing In..." : "Sign In & Join Group"}
                  onPress={handleSignIn}
                  theme="primary"
                  disabled={processing}
                />
              </View>
            ) : (
              /* Sign Up Form */
              <View style={styles.authForm}>
                <Input
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                />
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Create a password (min 6 characters)"
                  secureTextEntry
                />
                <Input
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  secureTextEntry
                />
                <Button
                  label={processing ? "Creating Account..." : "Sign Up & Join Group"}
                  onPress={handleSignUp}
                  theme="primary"
                  disabled={processing}
                />
              </View>
            )}
          </View>
        ) : (
          /* User is already signed in */
          <View style={styles.joinSection}>
            {invitationDetails.invitationType === 'email' && user.email !== invitationDetails.email ? (
              /* Email mismatch - show switch user option */
              <View style={styles.emailMismatchCard}>
                <Ionicons name="warning" size={24} color={theme.colors.error} />
                <Text style={styles.mismatchTitle}>Email Mismatch</Text>
                <Text style={styles.mismatchText}>
                  This invitation was sent to {invitationDetails.email}, but you&apos;re signed in as {user.email}.
                </Text>
                <Button
                  label="Switch Account"
                  onPress={handleSwitchUser}
                  theme="secondary"
                />
              </View>
            ) : (
              /* Ready to join */
              <View style={styles.readyCard}>
                <Ionicons name="checkmark-circle" size={48} color={theme.colors.secondary} />
                <Text style={styles.readyTitle}>Ready to Join!</Text>
                <Text style={styles.readyText}>
                  You&apos;re signed in as {user.email}
                </Text>
                <Button
                  label={processing ? "Joining Group..." : `Join ${invitationDetails.groupName}`}
                  onPress={handleJoinGroup}
                  theme="primary"
                  disabled={processing}
                />
                <TouchableOpacity style={styles.switchButton} onPress={handleSwitchUser}>
                  <Text style={styles.switchText}>Use a different account</Text>
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
    paddingVertical: theme.spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.layout.containerPadding,
    gap: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  errorText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  groupCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  groupSport: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.spacing.xs,
  },
  memberCount: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  groupDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  inviterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  inviterText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  invitationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.sm,
  },
  badgeText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  expirationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  expirationText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  authSection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  authTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  authSubtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  authToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.medium,
    padding: 4,
    marginBottom: theme.spacing.xl,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.small,
  },
  activeToggle: {
    backgroundColor: theme.colors.secondary,
  },
  toggleText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  activeToggleText: {
    color: theme.colors.primary,
  },
  authForm: {
    gap: theme.spacing.lg,
  },
  joinSection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  emailMismatchCard: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  mismatchTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  mismatchText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  readyCard: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  readyTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  readyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  switchButton: {
    padding: theme.spacing.md,
  },
  switchText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    textDecorationLine: 'underline',
  },
});
