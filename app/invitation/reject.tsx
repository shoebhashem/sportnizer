/**
 * EMAIL INVITATION REJECT HANDLER
 * ==============================
 * 
 * PURPOSE:
 * This page handles email invitation reject links when users click "Decline" 
 * buttons in their email. It processes the rejection and shows appropriate feedback.
 * 
 * FLOW:
 * 1. Extract invitation token from URL parameters
 * 2. Call respondToEmailInvite Firebase Function with reject action
 * 3. Display rejection confirmation or error message
 * 4. Provide navigation options to user
 * 
 * URL FORMAT:
 * /invitation/reject?token=${invitationToken}
 */

import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { functions } from '@/services/core/firebase';
import { router, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface RespondToEmailInviteResponse {
  success: boolean;
  action: 'accepted' | 'rejected' | 'expired' | 'already_used' | 'error';
  message: string;
  redirectUrl?: string;
  requiresSignup?: boolean;
  invitationDetails?: {
    groupName: string;
    clubName: string;
    inviterName: string;
  };
  error?: string;
}

export default function InvitationRejectScreen() {
  const { token } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState<RespondToEmailInviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || Array.isArray(token)) {
      setError('Invalid invitation link. No token found.');
      setLoading(false);
      return;
    }

    processRejection(token);
  }, [token]);

  const processRejection = async (invitationToken: string) => {
    try {
      console.log('🔗 Processing email invitation reject for token:', invitationToken);
      
      // Call the respondToEmailInvite Firebase Function with reject action
      const respondToEmailInviteFn = httpsCallable(functions, 'respondToEmailInvite');
      const result = await respondToEmailInviteFn({
        token: invitationToken,
        action: 'reject'
      });

      const rejectionResponse = result.data as RespondToEmailInviteResponse;
      console.log('📧 Rejection response received:', rejectionResponse);

      setResponse(rejectionResponse);

      if (!rejectionResponse.success) {
        // Handle error cases (expired, already used, etc.)
        setError(rejectionResponse.error || rejectionResponse.message);
      }

    } catch (error) {
      console.error('❌ Error processing invitation rejection:', error);
      setError('Failed to process invitation rejection. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoHome = () => {
    router.push('/' as any);
  };

  const handleContactSupport = () => {
    // TODO: Implement contact support functionality
    console.log('Contact support requested');
  };

  const handleChangeMyMind = () => {
    // Navigate to accept page with same token
    if (token && !Array.isArray(token)) {
      router.replace(`/invitation/accept?token=${token}` as any);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Processing your response...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          
          <View style={styles.buttonContainer}>
            <Button 
              label="Go to Home" 
              onPress={handleGoHome}
              theme="primary"
            />
            <Button 
              label="Contact Support" 
              onPress={handleContactSupport}
              theme="secondary"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (response) {
    const { invitationDetails } = response;
    
    if (response.action === 'rejected' && response.success) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>Invitation Declined</Text>
            <Text style={styles.successMessage}>
              {response.message}
            </Text>
            
            {invitationDetails && (
              <View style={styles.invitationDetails}>
                <Text style={styles.detailsTitle}>You declined invitation to:</Text>
                <Text style={styles.detailsText}>Group: {invitationDetails.groupName}</Text>
                <Text style={styles.detailsText}>Club: {invitationDetails.clubName}</Text>
                <Text style={styles.detailsText}>Invited by: {invitationDetails.inviterName}</Text>
              </View>
            )}

            <View style={styles.buttonContainer}>
              <Button 
                label="Changed My Mind - Accept Instead" 
                onPress={handleChangeMyMind}
                theme="primary"
              />
              <Button 
                label="Go to Home" 
                onPress={handleGoHome}
                theme="secondary"
              />
            </View>
          </View>
        </SafeAreaView>
      );
    }

    // Handle other response types (expired, already_used, etc.)
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningTitle}>Invitation Status</Text>
          <Text style={styles.warningMessage}>{response.message}</Text>
          
          <Button 
            label="Go to Home" 
            onPress={handleGoHome}
            theme="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.success,
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  warningIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  warningMessage: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  invitationDetails: {
    backgroundColor: theme.colors.inputBackground,
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
});
