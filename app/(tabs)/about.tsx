import { View, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';
import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import { signOutUser } from '../../services/authService';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

export default function AboutScreen() {
  const { user } = useAuth();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOutPress = () => {
    setShowSignOutModal(true);
  };

  const handleSignOutConfirm = async () => {
    setIsSigningOut(true);
    setShowSignOutModal(false);
    
    try {
      const result = await signOutUser();
      if (result.success) {
        router.replace('/login');
      } else {
        // Show error in a simple alert for now
        alert('Failed to sign out. Please try again.');
      }
    } catch (error) {
      console.error('Sign out error:', error);
      alert('An error occurred while signing out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSignOutCancel = () => {
    setShowSignOutModal(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>About Sportnizer</Text>
        <Text style={styles.description}>
          Sportnizer helps you organize and manage your sports groups, schedule events, and track team statistics.
        </Text>
        
        <View style={styles.userInfo}>
          <Text style={styles.userLabel}>Signed in as:</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          label="Sign Out"
          onPress={handleSignOutPress}
          theme="secondary"
          loading={isSigningOut}
          disabled={isSigningOut}
        />
      </View>

      <ConfirmationModal
        visible={showSignOutModal}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        onConfirm={handleSignOutConfirm}
        onCancel={handleSignOutCancel}
        confirmButtonTheme="primary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.layout.containerPadding,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.xxl,
  },
  userInfo: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
  },
  userLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  userEmail: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  footer: {
    paddingBottom: theme.spacing.xl,
  },
});
