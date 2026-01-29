import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/contexts/UserContext';
import { functions } from '@/services/core/firebase';
import { router } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreateClubForm() {
  const { user } = useAuth();
  const { userProfile, refreshUserProfile } = useUser();
  
  // Redirect users who already have clubs to home
  useEffect(() => {
    if (userProfile?.clubAccess && userProfile.clubAccess.length > 0) {
      router.replace('/(tabs)');
    }
  }, [userProfile]);
  
  const [clubName, setClubName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'error' as 'error' | 'success' | 'info',
  });

  const handleCreateClub = async () => {
    // Validation
    if (!clubName.trim()) {
      setModal({
        visible: true,
        title: 'Missing Information',
        message: 'Please enter a club name',
        type: 'error',
      });
      return;
    }

    if (!user) {
      setModal({
        visible: true,
        title: 'Authentication Required',
        message: 'Please sign in to create a club',
        type: 'error',
      });
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create club
      console.log('📝 Creating club...');
      const createClubFn = httpsCallable(functions, 'createClub');
      const createClubResult = await createClubFn({
        clubData: {
          name: clubName.trim(),
          description: description.trim(),
          location: location.trim(),
        },
      });

      const response = createClubResult.data as { success: boolean; clubId?: string; error?: string };

      if (!response.success || !response.clubId) {
        throw new Error(response.error || 'Failed to create club');
      }

      const clubId = response.clubId;
      console.log(`✅ Club created: ${clubId}`);

      // Step 2: Update user document (add to clubAccess[])
      console.log('📝 Updating user document...');
      const updateUserClubInfoFn = httpsCallable(functions, 'updateUserClubInfo');
      const userUpdateResult = await updateUserClubInfoFn({
        uid: user.uid,
        clubInfo: {
          clubId,
          clubName: clubName.trim(),
          role: 'club-admin',
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
        },
        role: 'club-admin',
      });

      const userResponse = userUpdateResult.data as { success: boolean; error?: string };
      if (!userResponse.success) {
        console.warn('⚠️ Failed to update user document:', userResponse.error);
      } else {
        console.log('✅ User document updated');
      }

      // Step 3: Add to club member list
      console.log('📝 Adding to club member list...');
      
      // Use userProfile if available, otherwise fall back to Firebase Auth user
      const displayName = userProfile?.displayName || user.displayName || user.email?.split('@')[0] || 'User';
      const photoURL = userProfile?.photoURL || user.photoURL || '';
      
      const addMemberToClubFn = httpsCallable(functions, 'addMemberToClub');
      const memberResult = await addMemberToClubFn({
        clubId,
        memberData: {
          userId: user.uid,
          roles: ['club-admin'],
          name: displayName,
          email: user.email || '',
          photoURL: photoURL,
          addedBy: user.uid,
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
          needsGuardian: false,
          guardiansContacts: [],
        },
      });

      const memberResponse = memberResult.data as { success: boolean; error?: string };
      if (!memberResponse.success) {
        console.warn('⚠️ Failed to add to club member list:', memberResponse.error);
      } else {
        console.log('✅ Added to club member list');
      }

      // Refresh user profile to show new club
      await refreshUserProfile();

      // Success!
      setModal({
        visible: true,
        title: 'Club Created! 🎉',
        message: `${clubName} has been successfully created. You can now create groups and invite members.`,
        type: 'success',
      });

      // Navigate to home after modal closes
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 2000);

    } catch (error: any) {
      console.error('❌ Error creating club:', error);
      
      // Handle resource limit errors specifically
      if (error.code === 'functions/resource-exhausted') {
        setModal({
          visible: true,
          title: 'Club Limit Reached',
          message: error.message || 'You have reached your club creation limit. Please contact support@sportnizer.com to upgrade your plan.',
          type: 'error',
        });
      } else {
        setModal({
          visible: true,
          title: 'Error',
          message: error.message || 'Failed to create club. Please try again.',
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Your Club</Text>
          <Text style={styles.subtitle}>
            Set up your sports organization and start managing teams
          </Text>
        </View>

        <View style={styles.form}>
          {/* Club Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Club Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Springfield Soccer Club"
              placeholderTextColor={theme.colors.textSecondary}
              value={clubName}
              onChangeText={setClubName}
              autoCapitalize="words"
              editable={!loading}
            />
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Tell us about your club..."
              placeholderTextColor={theme.colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Springfield, IL"
              placeholderTextColor={theme.colors.textSecondary}
              value={location}
              onChangeText={setLocation}
              autoCapitalize="words"
              editable={!loading}
            />
          </View>

          {/* Create Button */}
          <View style={styles.buttonContainer}>
            {loading ? (
              <ActivityIndicator size="large" color={theme.colors.secondary} />
            ) : (
              <Button
                label="Create Club"
                theme="primary"
                onPress={handleCreateClub}
              />
            )}
          </View>
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        onConfirm={() => {
          setModal({ ...modal, visible: false });
          if (modal.type === 'success') {
            router.replace('/(tabs)');
          } else if (modal.type === 'error' && modal.title === 'Authentication Required') {
            // Redirect to login if authentication is required
            router.replace('/login');
          }
        }}
        onCancel={() => setModal({ ...modal, visible: false })}
        confirmText="OK"
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
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  required: {
    color: theme.colors.error,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border || '#333',
  },
  textArea: {
    minHeight: 100,
    paddingTop: theme.spacing.md,
  },
  buttonContainer: {
    marginTop: theme.spacing.xl,
  },
});
