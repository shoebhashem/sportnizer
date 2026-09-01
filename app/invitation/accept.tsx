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
 * 2. Wait for Firebase Auth state to resolve (onAuthStateChanged fires once)
 * 3a. If user is already authenticated → skip interstitial, call respondToEmailInvite
 *     immediately (handles existing users who created an account after invite was sent)
 * 3b. If user is unauthenticated on mobile web → show interstitial:
 *       - "Open in app" button → deep-link into native app (Universal Link / App Link)
 *       - "Continue in browser" button → call respondToEmailInvite, then redirect to signup
 * 3c. If user is unauthenticated on desktop → call respondToEmailInvite immediately
 *
 * URL FORMAT:
 * /invitation/accept?token=${invitationToken}
 */

import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { auth } from '@/services/core/firebase';
import { functions } from '@/services/core/firebase';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// Store URLs — fill in once the app is published
// ---------------------------------------------------------------------------
const IOS_APP_STORE_URL = 'https://apps.apple.com/app/clubnizer/id6741680582';
const ANDROID_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.clubnizer.app';

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

interface InvitePreview {
  groupName: string;
  clubName: string;
  inviterName: string;
}

/** Returns true when running as a web page in a mobile browser. */
function isMobileWeb(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Returns 'ios' | 'android' | 'other' based on the user-agent. */
function getMobilePlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

type ScreenPhase =
  | 'resolving-auth'   // waiting for onAuthStateChanged
  | 'interstitial'     // mobile-web, unauthenticated: show choice
  | 'processing'       // calling respondToEmailInvite
  | 'result'           // show success/error UI
  | 'error';           // token validation error before any call

export default function InvitationAcceptScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { token } = useLocalSearchParams();
  const [phase, setPhase] = useState<ScreenPhase>('resolving-auth');
  const [response, setResponse] = useState<RespondToEmailInviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  // Prevent double-processing if the effect fires twice (React StrictMode)
  const hasProcessed = useRef(false);

  // -------------------------------------------------------------------------
  // Step 1 — validate token, then wait for Firebase Auth to settle
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!token) {
      setError(t("screens:invitationAccept.invalidLinkNoToken"));
      setPhase('error');
      return;
    }
    if (Array.isArray(token)) {
      setError(t("screens:invitationAccept.invalidLinkMultipleTokens"));
      setPhase('error');
      return;
    }

    // onAuthStateChanged fires once with the initial auth state (null or user).
    // We unsubscribe immediately after the first emission.
    //
    // In parallel, pre-fetch invitation preview data (read-only, no state change)
    // so we can show group/club/inviter name on the interstitial without waiting
    // for the user to click "Continue in browser".
    const validateFn = httpsCallable(functions, 'validateInvitationToken');
    validateFn({ invitationToken: token })
      .then((result: any) => {
        const data = result.data?.invitationData;
        if (data) {
          setInvitePreview({
            groupName: data.groupName || '',
            clubName: data.clubName || '',
            inviterName: data.inviterName || '',
          });
        }
      })
      .catch(() => { /* preview is optional — silently ignore errors */ });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // only need the first emission

      if (user) {
        // Existing / already-authenticated user — skip interstitial entirely.
        console.log('🔑 User already authenticated, processing invitation directly');
        setPhase('processing');
        processInvitation(token as string);
      } else if (isMobileWeb()) {
        // Unauthenticated on mobile browser — show interstitial.
        console.log('📱 Mobile web unauthenticated — showing interstitial');
        setPhase('interstitial');
      } else {
        // Desktop or other platform — process immediately (current behaviour).
        console.log('🖥️ Desktop / non-mobile — processing invitation directly');
        setPhase('processing');
        processInvitation(token as string);
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // -------------------------------------------------------------------------
  // Step 2 — call respondToEmailInvite
  // -------------------------------------------------------------------------
  const processInvitation = async (invitationToken: string) => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    try {
      console.log('🔗 Processing email invitation accept for token:', invitationToken);
      setPhase('processing');

      const respondToEmailInviteFn = httpsCallable(functions, 'respondToEmailInvite');
      const result = await respondToEmailInviteFn({
        token: invitationToken,
        action: 'accept',
      });

      const invitationResponse = result.data as RespondToEmailInviteResponse;
      console.log('📧 Invitation response received:', invitationResponse);

      setResponse(invitationResponse);
      setPhase('result');

      if (invitationResponse.success) {
        if (invitationResponse.requiresSignup) {
          console.log('🔄 Redirecting to signup with invitation context');
          router.replace(`/signup?invite=${invitationToken}`);
        } else {
          // Invitation processed for existing/authenticated user → dashboard
          console.log('✅ Invitation processed, redirecting to dashboard');
          setTimeout(() => {
            router.push('/(tabs)/' as any);
          }, 2000);
        }
      } else {
        setError(invitationResponse.error || invitationResponse.message);
        setPhase('result');
      }

    } catch (err) {
      console.error('❌ Error processing invitation:', err);
      setError(t("screens:invitationAccept.failedToProcess"));
      setPhase('result');
    }
  };

  // -------------------------------------------------------------------------
  // Interstitial actions
  // -------------------------------------------------------------------------
  const handleOpenInApp = () => {
    const invitationToken = Array.isArray(token) ? token[0] : token;
    const mobilePlatform = getMobilePlatform();
    const storeUrl =
      mobilePlatform === 'ios' ? IOS_APP_STORE_URL : ANDROID_PLAY_STORE_URL;

    // Step 1: Try the custom URL scheme — this opens the native app directly
    // if it is already installed. The OS silently ignores it if not installed.
    const deepLink = `clubnizer://invitation/accept?token=${invitationToken}`;
    Linking.openURL(deepLink).catch(() => {/* silent — app not installed */});

    // Step 2: After 2.5 seconds, if the user is still on this page the app
    // was not installed. Redirect them to the appropriate store.
    const storeRedirectTimer = setTimeout(() => {
      Linking.openURL(storeUrl).catch(() => {});
    }, 2500);

    // Clean up the timer if the component unmounts (user navigated away
    // because the deep-link succeeded and the native app opened).
    return () => clearTimeout(storeRedirectTimer);
  };

  const handleContinueInBrowser = () => {
    const invitationToken = Array.isArray(token) ? token[0] : token;
    if (invitationToken) {
      processInvitation(invitationToken);
    }
  };

  const handleRetryHome = () => {
    router.push('/' as any);
  };

  const handleContactSupport = () => {
    console.log('Contact support requested');
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Waiting for auth state
  if (phase === 'resolving-auth' || phase === 'processing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t("screens:invitationAccept.processingInvitation")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Mobile interstitial
  if (phase === 'interstitial') {
    const mobilePlatform = getMobilePlatform();
    const invitationToken = Array.isArray(token) ? token[0] : token;
    // app-argument deep-links the user straight to the invitation when they tap
    // the banner on a device that already has the app installed.
    const appArgument = `clubnizer://invitation/accept?token=${invitationToken}`;

    return (
      <>
        {/* iOS Smart App Banner — appears as a native iOS banner at the top of
            Safari. Tapping it opens the app directly to this invitation via the
            app-argument deep link, or takes the user to the App Store. */}
        <Head>
          <meta
            name="apple-itunes-app"
            content={`app-id=6741680582, app-argument=${appArgument}`}
          />
        </Head>

        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <Text style={styles.interstitialIcon}>📱</Text>
            <Text style={styles.interstitialTitle}>
              {t("screens:invitationAccept.interstitialTitle")}
            </Text>

            {/* Show invitation details if available from the preview fetch */}
            {invitePreview && (invitePreview.groupName || invitePreview.clubName) && (
              <View style={styles.interstitialPreviewCard}>
                {invitePreview.clubName ? (
                  <Text style={styles.interstitialPreviewText}>
                    {t("screens:invitationAccept.interstitialPreviewClub", { name: invitePreview.clubName })}
                  </Text>
                ) : null}
                {invitePreview.groupName ? (
                  <Text style={styles.interstitialPreviewText}>
                    {t("screens:invitationAccept.interstitialPreviewGroup", { name: invitePreview.groupName })}
                  </Text>
                ) : null}
                {invitePreview.inviterName ? (
                  <Text style={styles.interstitialPreviewMeta}>
                    {t("screens:invitationAccept.interstitialPreviewInvitedBy", { name: invitePreview.inviterName })}
                  </Text>
                ) : null}
              </View>
            )}

            <Text style={styles.interstitialMessage}>
              {t("screens:invitationAccept.interstitialMessage")}
            </Text>

            <View style={styles.buttonContainer}>
              {(mobilePlatform === 'ios' || mobilePlatform === 'android') && (
                <>
                  <Button
                    label={t("screens:invitationAccept.openInApp")}
                    onPress={handleOpenInApp}
                    theme="primary"
                  />
                  <Text style={styles.interstitialHint}>
                    {t("screens:invitationAccept.interstitialHint")}
                  </Text>
                </>
              )}
              <Button
                label={t("screens:invitationAccept.continueInBrowser")}
                onPress={handleContinueInBrowser}
                theme="secondary"
              />
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Error before any network call (bad token)
  if (phase === 'error' || (phase === 'result' && error)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorTitle}>{t("screens:invitationAccept.invitationError")}</Text>
          <Text style={styles.errorMessage}>{error}</Text>

          <View style={styles.buttonContainer}>
            <Button
              label={t("common:goToHome")}
              onPress={handleRetryHome}
              theme="primary"
            />
            <Button
              label={t("common:contactSupport")}
              onPress={handleContactSupport}
              theme="secondary"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'result' && response) {
    const { invitationDetails } = response;

    if (response.action === 'accepted') {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.successTitle}>{t("screens:invitationAccept.invitationAccepted")}</Text>
            <Text style={styles.successMessage}>{response.message}</Text>

            {invitationDetails && (
              <View style={styles.invitationDetails}>
                <Text style={styles.detailsTitle}>{t("screens:invitationAccept.invitationDetails")}</Text>
                <Text style={styles.detailsText}>{t("screens:invitationAccept.group", { name: invitationDetails.groupName })}</Text>
                <Text style={styles.detailsText}>{t("screens:invitationAccept.club", { name: invitationDetails.clubName })}</Text>
                <Text style={styles.detailsText}>{t("screens:invitationAccept.invitedByDetail", { name: invitationDetails.inviterName })}</Text>
              </View>
            )}

            {!response.requiresSignup ? (
              <Text style={styles.redirectMessage}>
                {t("screens:invitationAccept.redirectingToDashboard")}
              </Text>
            ) : (
              <View style={styles.buttonContainer}>
                <Button
                  label={t("screens:invitationAccept.continueToSignUp")}
                  onPress={() => router.replace(`/signup?invite=${token}`)}
                  theme="primary"
                />
              </View>
            )}
          </View>
        </SafeAreaView>
      );
    }

    // expired, already_used, etc.
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningTitle}>{t("screens:invitationAccept.invitationStatus")}</Text>
          <Text style={styles.warningMessage}>{response.message}</Text>

          <Button
            label={t("common:goToHome")}
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
  // --- Interstitial ---
  interstitialIcon: {
    fontSize: 56,
    marginBottom: 20,
  },
  interstitialTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  interstitialMessage: {
    fontSize: 15,
    color: theme.colors.textSecondary || theme.colors.text,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  interstitialPreviewCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 24,
    width: '100%',
    gap: 4,
  },
  interstitialPreviewText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
  interstitialPreviewMeta: {
    fontSize: 13,
    color: theme.colors.textSecondary || theme.colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  interstitialHint: {
    fontSize: 13,
    color: theme.colors.textSecondary || theme.colors.text,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  // --- Error ---
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
  // --- Success ---
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
  // --- Warning ---
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
  // --- Invitation details card ---
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
