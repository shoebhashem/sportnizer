import { router, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
    Alert,
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
import { theme } from '../constants/theme';
import { functions } from '../firebaseConfig';

export default function AddMembersScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSendInvitation = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address.');
      return;
    }

    if (!validateEmail(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    if (!groupId) {
      Alert.alert('Error', 'Group ID is missing. Please try again.');
      return;
    }

    setLoading(true);

    try {
      const sendInvitation = httpsCallable(functions, 'sendGroupInvitation');
      
      await sendInvitation({
        email: email.trim().toLowerCase(),
        groupId: groupId,
        groupName: 'Your Team', // You might want to pass this as a parameter
        inviterName: 'Team Admin' // You might want to get this from user context
      });

      Alert.alert(
        'Invitation Sent! 📧',
        `An invitation has been sent to ${email.trim()}. They will receive an email with instructions to join your team.`,
        [
          {
            text: 'Send Another',
            onPress: () => setEmail(''),
            style: 'default'
          },
          {
            text: 'Done',
            onPress: () => router.back(),
            style: 'cancel'
          }
        ]
      );
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
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
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
              Send an email invitation to add a new member to your team
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
