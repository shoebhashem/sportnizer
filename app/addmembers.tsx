import { router, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import { theme } from '../constants/theme';
import { functions } from '../firebaseConfig';

export default function AddMembersScreen() {
  const { groupId, groupName, inviterName } = useLocalSearchParams<{ 
    groupId: string; 
    groupName: string; 
    inviterName: string; 
  }>();
  
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Modal states for web-compatible feedback
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const decodedGroupName = groupName ? decodeURIComponent(groupName) : 'Your Team';
  const decodedInviterName = inviterName ? decodeURIComponent(inviterName) : 'Team Admin';

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSendInvitation = async () => {
    if (!email.trim()) {
      setModalMessage('Please enter an email address.');
      setErrorModalVisible(true);
      return;
    }

    if (!validateEmail(email.trim())) {
      setModalMessage('Please enter a valid email address.');
      setErrorModalVisible(true);
      return;
    }

    if (!groupId) {
      setModalMessage('Group ID is missing. Please try again.');
      setErrorModalVisible(true);
      return;
    }

    setLoading(true);

    try {
      const sendInvitation = httpsCallable(functions, 'sendGroupInvitation');
      
      await sendInvitation({
        email: email.trim().toLowerCase(),
        groupId: groupId,
        groupName: decodedGroupName,
        inviterName: decodedInviterName
      });

      setModalMessage(`🎉 Invitation Sent!\n\nAn invitation has been sent to ${email.trim()}. They will receive an email with instructions to join "${decodedGroupName}".`);
      setSuccessModalVisible(true);
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      
      let errorMessage = 'Failed to send invitation. Please try again.';
      
      if (error.code === 'functions/already-exists') {
        errorMessage = 'This user is already a member of the team.';
      } else if (error.code === 'functions/already-invited') {
        errorMessage = 'An invitation has already been sent to this email address.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setModalMessage(errorMessage);
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const handleSuccessModalConfirm = (action: 'another' | 'done') => {
    setSuccessModalVisible(false);
    if (action === 'another') {
      setEmail('');
    } else {
      router.back();
    }
  };

  const handleErrorModalClose = () => {
    setErrorModalVisible(false);
    setModalMessage('');
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
            <Text style={styles.title}>Invite Team Member</Text>
            <Text style={styles.subtitle}>
              Send an email invitation to add a new member to {decodedGroupName}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter team member's email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#A0A0A0"
              />
            </View>

            <View style={styles.buttonContainer}>
              <Button
                label="Send Invitation"
                onPress={handleSendInvitation}
                theme="primary"
                loading={loading}
                disabled={loading || !email.trim()}
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
      </KeyboardAvoidingView>

      {/* Success Modal - Web Compatible */}
      <ConfirmationModal
        visible={successModalVisible}
        title="Invitation Sent! 📧"
        message={modalMessage}
        confirmText="Send Another"
        cancelText="Done"
        onConfirm={() => handleSuccessModalConfirm('another')}
        onCancel={() => handleSuccessModalConfirm('done')}
        confirmButtonTheme="primary"
      />

      {/* Error Modal - Web Compatible */}
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
    fontWeight: theme.typography.fontWeight.bold,
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
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  inputLabel: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.borderRadius.medium,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  buttonContainer: {
    marginTop: theme.spacing.lg,
  },
});
