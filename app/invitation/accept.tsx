/**
 * EMAIL INVITATION ACCEPT HANDLER
 * ==============================
 * 
 * PURPOSE:
 * This page handles email invitation accept links when users click "Accept Invitation" 
 * buttons in their email. It implements the dynamic routing logic based on user 
 * authentication state.
 * 
 * FLOW:
 * 1. Extract invitation token from URL parameters
 * 2. Call respondToEmailInvite Firebase Function with accept action
 * 3. Handle response based on user state:
 *    - requiresSignup: true → Redirect to signup with invitation context
 *    - requiresSignup: false → Process invitation and redirect to dashboard
 * 4. Display appropriate loading/error states
 * 
 * URL FORMAT:
 * /invitation/accept?token=${invitationToken}
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

export default function InvitationAcceptScreen() {
  const { token } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState<RespondToEmailInviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('📱 InvitationAcceptScreen mounted, token:', token);
    
    if (!token) {
      setError('Invalid invitation link. No token found.');
      setLoading(false);
      return;
    }
    
    if (Array.isArray(token)) {
      setError('Invalid invitation link. Multiple tokens found.');
      setLoading(false);
      return;
    }

    processInvitation(token);
  }, [token]);

  const processInvitation = async (invitationToken: string) => {
    try {
      console.log('🔗 Processing email invitation accept for token:', invitationToken);
      
      // Call the respondToEmailInvite Firebase Function
      const respondToEmailInviteFn = httpsCallable(functions, 'respondToEmailInvite');
      const result = await respondToEmailInviteFn({
        token: invitationToken,
        action: 'accept'
      });

      const invitationResponse = result.data as RespondToEmailInviteResponse;
      console.log('📧 Invitation response received:', invitationResponse);

      setResponse(invitationResponse);

      if (invitationResponse.success) {
        if (invitationResponse.requiresSignup) {
          // User needs to sign up first
          console.log('🔄 Redirecting to signup with invitation context');
          router.replace(`/signup?invite=${invitationToken}`);
        } else if (invitationResponse.redirectUrl) {
          // User exists and invitation processed, redirect to dashboard
          console.log('✅ Invitation processed, redirecting to:', invitationResponse.redirectUrl);
          // Add a small delay to show success message before redirect
          setTimeout(() => {
            // Use a safe navigation method
            router.push('/(tabs)/' as any);
          }, 2000);
        }
      } else {
        // Handle error cases (expired, already used, etc.)
        setError(invitationResponse.error || invitationResponse.message);
      }

    } catch (error) {
      console.error('❌ Error processing invitation:', error);
      setError('Failed to process invitation. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryHome = () => {
    router.push('/' as any);
  };

  const handleContactSupport = () => {
    // TODO: Implement contact support functionality
    console.log('Contact support requested');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Processing your invitation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorTitle}>Invitation Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          
          <View style={styles.buttonContainer}>
            <Button 
              label="Go to Home" 
              onPress={handleRetryHome}
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
    
    if (response.action === 'accepted') {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.successTitle}>Invitation Accepted!</Text>
            <Text style={styles.successMessage}>
              {response.message}
            </Text>
            
            {invitationDetails && (
              <View style={styles.invitationDetails}>
                <Text style={styles.detailsTitle}>Invitation Details:</Text>
                <Text style={styles.detailsText}>Group: {invitationDetails.groupName}</Text>
                <Text style={styles.detailsText}>Club: {invitationDetails.clubName}</Text>
                <Text style={styles.detailsText}>Invited by: {invitationDetails.inviterName}</Text>
              </View>
            )}

            {!response.requiresSignup && (
              <Text style={styles.redirectMessage}>
                You will be redirected to the dashboard shortly...
              </Text>
            )}
          </View>
        </SafeAreaView>
      );
    }

    // Handle other action types (expired, already_used, etc.)
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningTitle}>Invitation Status</Text>
          <Text style={styles.warningMessage}>{response.message}</Text>
          
          <Button 
            label="Go to Home" 
            onPress={handleRetryHome}
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
    color: theme.colors.success || theme.colors.primary,
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
    color: theme.colors.textSecondary || theme.colors.text,
    marginBottom: 4,
  },
  redirectMessage: {
    fontSize: 14,
    color: theme.colors.textSecondary || theme.colors.text,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
});
