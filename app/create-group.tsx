import AdContainer from '@/components/AdContainer';
import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { createGroup, SPORT_TYPES } from '@/services/groupService';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DropdownInput from '../components/DropdownInput';

// Age group options
const AGE_GROUP_OPTIONS = [
  'Children/Youth (0-17 years) - Requires guardian communication',
  'Adults (18+ years)',
  'Mixed (All ages in the same group)'
];

export default function CreateGroupScreen() {
  const [groupName, setGroupName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [sportType, setSportType] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

  // Error states
  const [groupNameError, setGroupNameError] = useState('');
  const [ageGroupError, setAgeGroupError] = useState('');
  const [sportTypeError, setSportTypeError] = useState('');

  // Modal states
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const validateForm = () => {
    let isValid = true;

    // Reset errors
    setGroupNameError('');
    setAgeGroupError('');
    setSportTypeError('');

    // Validate group name
    if (!groupName.trim()) {
      setGroupNameError('Group name is required');
      isValid = false;
    } else if (groupName.trim().length < 3) {
      setGroupNameError('Group name must be at least 3 characters');
      isValid = false;
    } else if (groupName.trim().length > 50) {
      setGroupNameError('Group name must be less than 50 characters');
      isValid = false;
    }

    // Validate age group
    if (!ageGroup) {
      setAgeGroupError('Please select an age group');
      isValid = false;
    }

    // Validate sport type
    if (!sportType) {
      setSportTypeError('Please select a sport type');
      isValid = false;
    }

    return isValid;
  };

  const handleCreateGroup = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      const result = await createGroup({
        name: groupName.trim(),
        sportType,
        location: '', // Temporary placeholder
        customStats: [] // Empty array for now
      });

      if (result.success && result.groupId) {
        setCreatedGroupId(result.groupId);
        setModalMessage(`Great! Your ${sportType} group "${groupName}" has been created successfully. You can now start inviting members and scheduling events.`);
        setSuccessModalVisible(true);
      } else {
        let errorMessage = 'Failed to create group. Please try again.';
        
        switch (result.error?.code) {
          case 'limit/max-groups-reached':
            errorMessage = result.error.message;
            break;
          case 'auth/no-user':
            errorMessage = 'You must be signed in to create a group.';
            break;
          default:
            errorMessage = result.error?.message || errorMessage;
        }
        
        setModalMessage(errorMessage);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error('Create group error:', error);
      setModalMessage('An unexpected error occurred. Please try again.');
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessModalConfirm = () => {
    setSuccessModalVisible(false);
    // Navigate to manage-group screen for the newly created group
    if (createdGroupId) {
      router.replace('/manage-group');
    } else {
      // Fallback to home screen if no group ID
      router.replace('/(tabs)');
    }
  };

  const handleErrorModalClose = () => {
    setErrorModalVisible(false);
    setModalMessage('');
  };

  const handleCancel = () => {
    router.replace('/(tabs)');
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Create New Group</Text>
            <Text style={styles.subtitle}>Set up your sports group and start organizing events</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Group Name *"
              value={groupName}
              onChangeText={setGroupName}
              placeholder="e.g., Gais Pojkar 2016"
              error={groupNameError}
            />

            <DropdownInput
              label="Age Group *"
              value={ageGroup}
              onValueChange={setAgeGroup}
              options={AGE_GROUP_OPTIONS}
              placeholder="Select age group"
              error={ageGroupError}
            />

            <DropdownInput
              label="Sport Type *"
              value={sportType}
              onValueChange={setSportType}
              options={SPORT_TYPES}
              placeholder="Select a sport"
              error={sportTypeError}
            />

            <View style={styles.buttonContainer}>
              <Button
                label="Create Group"
                onPress={handleCreateGroup}
                theme="primary"
                loading={loading}
                disabled={loading}
              />

              <Button
                label="Cancel"
                onPress={handleCancel}
                theme="secondary"
                disabled={loading}
              />
            </View>
          </View>
        </ScrollView>
        
        <AdContainer position="bottom" />
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={successModalVisible}
        title="Group Created!"
        message={modalMessage}
        confirmText="Continue"
        cancelText=""
        onConfirm={handleSuccessModalConfirm}
        onCancel={handleSuccessModalConfirm}
        confirmButtonTheme="primary"
      />

      <ConfirmationModal
        visible={errorModalVisible}
        title="Error"
        message={modalMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={handleErrorModalClose}
        onCancel={handleErrorModalClose}
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
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  customStatsSection: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  sectionSubtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  buttonContainer: {
    marginTop: theme.spacing.xl,
  },
});
