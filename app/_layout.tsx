import { theme } from "@/constants/theme";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClubDataProvider } from "@/contexts/ClubDataContext";
import { DataCacheProvider } from "@/contexts/DataCacheContext";
import { EventProvider } from "@/contexts/EventContext";
import { GroupDataProvider } from "@/contexts/GroupDataContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NewsProvider } from "@/contexts/NewsContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { UserProvider } from "@/contexts/UserContext";
import "@/i18n";
import { markNotificationAsRead } from "@/services/fetchNotifications";
import { setupNotificationChannels } from "@/services/pushNotificationService";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity } from "react-native";

// ---------------------------------------------------------------------------
// Navigate based on notification payload data.
// Defined at module level so it can be called from multiple useEffect hooks
// without needing to be added to their dependency arrays.
// ---------------------------------------------------------------------------

// When the app is in background (suspended but not killed), both
// useLastNotificationResponse and addNotificationResponseReceivedListener fire
// for the same tap. This set deduplicates them so only the first handler wins.
const handledNotificationRequestIds = new Set<string>();

function redirectFromNotification(
  data: Record<string, unknown>,
  requestId?: string,
) {
  // Deduplicate: if we've already handled this notification request, bail out.
  // Both cold-start and background handlers can fire for the same tap.
  if (requestId) {
    if (handledNotificationRequestIds.has(requestId)) return;
    handledNotificationRequestIds.add(requestId);
  }

  // Mark the corresponding bell notification as read when the user taps the push
  if (
    typeof data.notificationId === "string" &&
    typeof data.userId === "string"
  ) {
    markNotificationAsRead(data.userId, data.notificationId).catch(() => {
      // Non-fatal — bell will still update on next sync
    });
  }

  if (data.route && typeof data.route === "string") {
    const params =
      data.routeParams && typeof data.routeParams === "object"
        ? data.routeParams
        : {};
    router.push({ pathname: data.route as any, params } as any);
  } else if (data.actionUrl && typeof data.actionUrl === "string") {
    router.push(data.actionUrl as any);
  }
}

// Suppress console logs in production to prevent exposing sensitive data
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
  console.debug = () => {};
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <DataCacheProvider>
        <UserProvider>
          <ClubDataProvider>
            <GroupDataProvider>
              <EventProvider>
                <NewsProvider>
                  <AuthProvider>
                    <OnboardingProvider>
                      <StatusBar style="light" />
                      <RootLayoutNav />
                    </OnboardingProvider>
                  </AuthProvider>
                </NewsProvider>
              </EventProvider>
            </GroupDataProvider>
          </ClubDataProvider>
        </UserProvider>
      </DataCacheProvider>
    </LanguageProvider>
  );
}

function RootLayoutNav() {
  const { t } = useTranslation("navigation");

  // ---------------------------------------------------------------------------
  // Push notification foreground handler
  // Suppress OS banners when the app is open — user already sees the bell badge
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS === "web") return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false, // Suppress banner when app is in foreground
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      }),
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Set up notification channels/categories early (before permission prompt)
  // Push token registration is deferred to (tabs)/_layout.tsx so the OS
  // permission dialog only appears after login/signup completes.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS === "web") return;
    setupNotificationChannels();
  }, []);

  // ---------------------------------------------------------------------------
  // Notification tap handler — deep-link when app was killed/backgrounded
  // ---------------------------------------------------------------------------

  // Cold-start (app terminated): useLastNotificationResponse is a reactive
  // hook — the effect fires when the response becomes available AFTER the
  // navigator has finished initialising its initial route. This avoids the
  // race condition where router.push() is called before Expo Router is ready.
  // See: https://docs.expo.dev/versions/latest/sdk/notifications/#uselastnotificationresponse
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (
      lastNotificationResponse &&
      lastNotificationResponse.actionIdentifier ===
        Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const data = lastNotificationResponse.notification.request.content.data;
      const requestId =
        lastNotificationResponse.notification.request.identifier;
      if (data) {
        redirectFromNotification(data, requestId);
        Notifications.clearLastNotificationResponse();
      }
    }
  }, [lastNotificationResponse]);

  // Background / foreground: fires when user taps a notification while the
  // app is already running (or was suspended but not killed).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (
          response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
        )
          return;
        const data = response.notification.request.content.data;
        const requestId = response.notification.request.identifier;
        if (!data) return;
        redirectFromNotification(data, requestId);
      },
    );
    return () => subscription.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.primary },
        headerLeft: ({ canGoBack, tintColor }) => {
          if (canGoBack) {
            // Normal stack — render a back arrow that pops the stack
            return (
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  marginLeft: Platform.OS === "web" ? 8 : 0,
                  padding: 8,
                }}
              >
                <Ionicons
                  name="arrow-back"
                  size={24}
                  color={tintColor ?? theme.colors.white}
                />
              </TouchableOpacity>
            );
          }
          // No stack history (e.g., after returning from an external redirect
          // like Stripe checkout on web) — navigate home
          return (
            <TouchableOpacity
              onPress={() => router.replace("/(tabs)")}
              style={{
                marginLeft: Platform.OS === "web" ? 8 : 0,
                padding: 8,
              }}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={tintColor ?? theme.colors.white}
              />
            </TouchableOpacity>
          );
        },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="about"
        options={{
          headerShown: true,
          title: t("screens.about"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen
        name="create-club-form"
        options={{
          headerShown: true,
          title: t("screens.createClub"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
        }}
      />
      <Stack.Screen
        name="create-event"
        options={{
          headerShown: false,
          title: t("screens.createEvent"),
        }}
      />
      <Stack.Screen
        name="select-event-members"
        options={{
          headerShown: true,
          title: t("screens.selectEventMembers"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="event-details"
        options={{
          headerShown: true,
          title: t("screens.eventDetails"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="manage-club"
        options={{
          headerShown: true,
          title: t("screens.manageClub"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="club-info"
        options={{
          headerShown: true,
          title: t("screens.clubInfo"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="group-info"
        options={{
          headerShown: true,
          title: t("screens.groupInfo"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="manageteams"
        options={{
          headerShown: true,
          title: t("screens.manageTeams"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
        }}
      />
      <Stack.Screen
        name="addmembers"
        options={{
          headerShown: true,
          title: t("screens.addMembers"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
        }}
      />
      <Stack.Screen
        name="manage-group"
        options={{
          headerShown: true,
          title: t("screens.manageGroup"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="manage-subgroup"
        options={{
          headerShown: true,
          title: t("screens.manageSubgroup"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="manage-subgroup-members"
        options={{
          headerShown: true,
          title: t("screens.manageMembers"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="group-settings"
        options={{
          headerShown: true,
          title: t("screens.groupSettings"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="club-settings"
        options={{
          headerShown: true,
          title: t("screens.clubSettings"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="subscription-settings"
        options={{
          headerShown: true,
          title: t("screens.subscription"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="track-payments"
        options={{
          headerShown: true,
          title: t("screens.trackPayments"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="subgroup-settings"
        options={{
          headerShown: true,
          title: t("screens.subgroupSettings"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="add-adult-member"
        options={{
          headerShown: true,
          title: t("screens.addMember"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="add-child-member"
        options={{
          headerShown: true,
          title: t("screens.addYouthPlayer"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="remove-member"
        options={{
          headerShown: false,
          title: t("screens.removeMember"),
        }}
      />
      <Stack.Screen
        name="remove-guardian"
        options={{
          headerShown: true,
          title: t("screens.removeGuardian"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          headerShown: true,
          title: t("screens.profile"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.white,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="view-statistics"
        options={{
          headerShown: true,
          title: t("screens.statistics"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="stripe-onboarding"
        options={{
          headerShown: true,
          title: t("screens.paymentSetup"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="stripe-return"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="stripe-refresh"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="payment-success"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="payment-cancelled"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="create-fee"
        options={{
          headerShown: true,
          title: t("screens.createFee"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="manage-fees"
        options={{
          headerShown: true,
          title: t("screens.manageFees"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="accounting"
        options={{
          headerShown: true,
          title: t("screens.accounting"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="accounting-settings"
        options={{
          headerShown: true,
          title: t("screens.accountingSettings"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="lok-reports"
        options={{
          headerShown: true,
          title: "LOK-stöd",
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="lok-settings"
        options={{
          headerShown: true,
          title: "LOK-inställningar",
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="chart-of-accounts"
        options={{
          headerShown: true,
          title: t("screens.chartOfAccounts"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="role-permissions"
        options={{
          headerShown: true,
          title: t("screens.rolePermissions"),
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.secondary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="create-news"
        options={{
          headerShown: false,
          title: t("screens.createNews"),
        }}
      />
      <Stack.Screen
        name="news-details"
        options={{
          headerShown: false,
          title: t("screens.newsDetails"),
        }}
      />
    </Stack>
  );
}
