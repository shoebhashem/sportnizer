import { theme } from "@/constants/theme";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataCacheProvider } from "@/contexts/DataCacheContext";
import { EventProvider } from "@/contexts/EventContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NewsProvider } from "@/contexts/NewsContext";
import { UserProvider } from "@/contexts/UserContext";
import "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useNavigation } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity } from "react-native";

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
          <EventProvider>
            <NewsProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </NewsProvider>
          </EventProvider>
        </UserProvider>
      </DataCacheProvider>
    </LanguageProvider>
  );
}

function RootLayoutNav() {
  const { t } = useTranslation("navigation");
  const navigation = useNavigation();

  // Fallback back button for when the navigation stack is empty (e.g., after
  // returning from an external redirect like Stripe checkout on web).
  const renderFallbackBackButton = () => {
    if (navigation.canGoBack()) {
      // Normal stack — let expo-router render its default back arrow
      return undefined;
    }
    // No stack history — show a manual arrow that navigates home
    return (
      <TouchableOpacity
        onPress={() => router.replace("/(tabs)")}
        style={{ marginLeft: Platform.OS === "web" ? 8 : 0, padding: 8 }}
      >
        <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
      </TouchableOpacity>
    );
  };

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.primary },
        headerLeft: renderFallbackBackButton,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
        name="create-membership-fee"
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
