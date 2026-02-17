import AuthGuard from "@/components/AuthGuard";
import NotificationBell from "@/components/NotificationBell";
import UserAvatar from "@/components/UserAvatar";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Header component with NotificationBell and UserAvatar
function HeaderRight() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginRight: 8,
      }}
    >
      <NotificationBell iconSize={24} iconColor={theme.colors.white} />
      <UserAvatar />
    </View>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  const { userProfile, isLoading, hasLoadedFreshData } = useUserProfile();

  // NOW DO CONDITIONAL RETURNS - AFTER ALL HOOKS
  // Wait for userProfile to load before making redirect decisions
  if (isLoading) {
    return null; // or a loading spinner
  }

  // Redirect based on auth state and club membership
  if (!user) {
    // Not authenticated - show welcome screen
    return <Redirect href="/welcome" />;
  }

  // ⚠️ CRITICAL: Wait for fresh data to be loaded before checking clubAccess
  // This prevents redirecting to create-club-form when user was just added to a club
  // during signup (the profile needs to be refreshed from Firestore first)
  if (!hasLoadedFreshData && user) {
    // Still loading fresh data - show loading state
    console.log("⏳ TabLayout waiting for fresh user data...");
    return null;
  }

  if (!userProfile?.clubAccess || userProfile.clubAccess.length === 0) {
    // Authenticated but no clubs - redirect directly to create club form
    console.log(
      "🔄 TabLayout: No clubs found, redirecting to create-club-form",
    );
    return <Redirect href="/create-club-form" />;
  }

  return (
    <AuthGuard>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.primary }}
        edges={["top", "bottom"]}
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
            headerLeftContainerStyle:
              Platform.OS !== "web"
                ? {
                    alignItems: "center",
                    justifyContent: "center",
                  }
                : undefined,
            headerRightContainerStyle:
              Platform.OS !== "web"
                ? {
                    alignItems: "center",
                    justifyContent: "center",
                  }
                : undefined,

            headerRight: () => <HeaderRight />,
            tabBarStyle: {
              backgroundColor: theme.colors.primary,
              height: 60,
              // Safe area automatically handled by SafeAreaView
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
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
            name="events"
            options={{
              title: "Events",
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
              title: "Groups",
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? "people" : "people-outline"}
                  color={color}
                  size={24}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="about"
            options={{
              title: "About",
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={
                    focused
                      ? "information-circle"
                      : "information-circle-outline"
                  }
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
