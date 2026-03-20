import AuthGuard from "@/components/AuthGuard";
import LegalAcceptanceScreen from "@/components/LegalAcceptanceScreen";
import NotificationBell from "@/components/NotificationBell";
import UserAvatar from "@/components/UserAvatar";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserContext";
import { signOutUser } from "@/services/auth/authService";
import { legalService } from "@/services/legal/legalService";
import {
  registerForPushNotificationsAsync,
  savePushTokenToFirestore,
} from "@/services/pushNotificationService";
import { VersionCheckResult } from "@/services/types/legal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router, Tabs } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  Platform,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

// Header logo that navigates to the About screen
function HeaderLeft() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginLeft: 12,
      }}
    >
      <TouchableOpacity
        onPress={() => router.push("/about")}
        style={{
          padding: 4,
          ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
        }}
        activeOpacity={0.7}
        accessibilityLabel="About Clubnizer"
        accessibilityRole="button"
      >
        <Image
          source={require("@/assets/images/clubnizer_logo.png")}
          style={{ width: 36, height: 36, borderRadius: 8 }}
          resizeMode="contain"
        />
      </TouchableOpacity>
    </View>
  );
}

// Header component with NotificationBell and UserAvatar
function HeaderRight() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginRight: 12,
      }}
    >
      <NotificationBell iconSize={24} iconColor={theme.colors.white} />
      <UserAvatar />
    </View>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  const { t } = useTranslation("navigation");
  const { isLoading, hasLoadedFreshData } = useUserProfile();
  const insets = useSafeAreaInsets();
  const pushTokenRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Register push token AFTER user reaches main app (tabs).
  // This ensures the OS permission dialog never fires during login/signup,
  // which previously caused Android to return to the launching activity (Chrome).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!user?.uid) {
      // User logged out — clean up token ref
      if (pushTokenRef.current) pushTokenRef.current = null;
      return;
    }

    const register = async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        pushTokenRef.current = token;
        await savePushTokenToFirestore(user.uid, token);
      }
    };

    register();
  }, [user?.uid]);

  // Legal acceptance state
  const [legalCheckResult, setLegalCheckResult] =
    useState<VersionCheckResult | null>(null);
  const [isCheckingLegal, setIsCheckingLegal] = useState(true);
  const [isAcceptingLegal, setIsAcceptingLegal] = useState(false);

  // Check legal versions when user is authenticated
  useEffect(() => {
    const checkLegalAcceptance = async () => {
      if (!user?.uid) {
        setIsCheckingLegal(false);
        return;
      }

      try {
        console.log("⚖️ Checking legal acceptance for user:", user.uid);
        const result = await legalService.checkLegalVersions(user.uid);
        console.log("⚖️ Legal check result:", result);
        setLegalCheckResult(result);
      } catch (error) {
        console.error("Error checking legal versions:", error);
        // On error, don't block the user
        setLegalCheckResult({
          requiresAcceptance: false,
          termsOutdated: false,
          privacyOutdated: false,
          neverAccepted: false,
          materialChangesSummary: null,
          currentTermsVersion: "",
          currentPrivacyVersion: "",
        });
      } finally {
        setIsCheckingLegal(false);
      }
    };

    checkLegalAcceptance();
  }, [user?.uid]);

  // Handle legal acceptance
  const handleLegalAccept = async () => {
    if (!legalCheckResult) return;

    setIsAcceptingLegal(true);
    try {
      const result = await legalService.acceptCurrentLegalDocuments(
        "login_re-acceptance",
      );

      if (result.success) {
        console.log("✅ Legal acceptance recorded successfully");
        // User doc listener will pick up the updated legal acceptance automatically
        // Clear the legal check - user has now accepted
        setLegalCheckResult({
          ...legalCheckResult,
          requiresAcceptance: false,
        });
      } else {
        console.error("Failed to record legal acceptance:", result.error);
      }
    } catch (error) {
      console.error("Error recording legal acceptance:", error);
    } finally {
      setIsAcceptingLegal(false);
    }
  };

  // Handle sign out from legal screen
  const handleLegalSignOut = async () => {
    await signOutUser();
  };

  // NOW DO CONDITIONAL RETURNS - AFTER ALL HOOKS
  // Wait for userProfile to load before making redirect decisions
  if (isLoading || isCheckingLegal) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
        edges={["top", "bottom"]}
      >
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </SafeAreaView>
    );
  }

  // Redirect based on auth state and club membership
  if (!user) {
    // Not authenticated - show welcome screen
    return <Redirect href="/welcome" />;
  }

  // Check if user needs to accept legal documents
  if (legalCheckResult?.requiresAcceptance) {
    console.log("⚖️ User needs to accept legal documents");
    return (
      <LegalAcceptanceScreen
        mode={legalCheckResult.neverAccepted ? "signup" : "re-acceptance"}
        termsVersion={legalCheckResult.currentTermsVersion}
        privacyVersion={legalCheckResult.currentPrivacyVersion}
        materialChangesSummary={legalCheckResult.materialChangesSummary}
        onAccept={handleLegalAccept}
        onCancel={handleLegalSignOut}
        isLoading={isAcceptingLegal}
      />
    );
  }

  // ⚠️ CRITICAL: Wait for fresh data to be loaded before checking clubAccess
  // This prevents issues when user was just added to a club
  // during signup (the profile needs to be refreshed from Firestore first)
  if (!hasLoadedFreshData && user) {
    // Still loading fresh data - show loading state
    console.log("⏳ TabLayout waiting for fresh user data...");
    return null;
  }

  // Users without clubs can now access the app - they'll see "Create Club" card on home screen
  // No longer forcing redirect to create-club-form

  return (
    <AuthGuard>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.primary }}
        edges={Platform.OS === "android" ? ["top"] : ["top", "bottom"]}
      >
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: theme.colors.secondary,
            headerStyle: {
              backgroundColor: theme.colors.primary,
            },
            headerShadowVisible: false,
            headerTintColor: theme.colors.white,
            headerTitleAlign: "center",
            headerTitleContainerStyle:
              Platform.OS !== "web"
                ? {
                    alignItems: "center",
                    justifyContent: "center",
                  }
                : undefined,
            headerLeftContainerStyle: undefined,
            headerRightContainerStyle: undefined,

            headerLeft: () => <HeaderLeft />,
            headerRight: () => <HeaderRight />,
            tabBarStyle: {
              backgroundColor: theme.colors.primary,
              height: Platform.OS === "android" ? 60 + insets.bottom : 60,
              paddingBottom: Platform.OS === "android" ? insets.bottom : 0,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t("tabs.home"),
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "home-sharp" : "home-outline"}
                  color={color}
                  size={24}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="news"
            options={{
              title: t("tabs.news"),
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "newspaper" : "newspaper-outline"}
                  color={color}
                  size={24}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="events"
            options={{
              title: t("tabs.events"),
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "calendar" : "calendar-outline"}
                  color={color}
                  size={24}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="groups"
            options={{
              title: t("tabs.groups"),
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "people" : "people-outline"}
                  color={color}
                  size={24}
                />
              ),
            }}
          />
        </Tabs>
      </SafeAreaView>
    </AuthGuard>
  );
}
