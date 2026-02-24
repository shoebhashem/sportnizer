import { theme } from "@/constants/theme";
import { AuthProvider } from "@/contexts/AuthContext";
import { EventProvider } from "@/contexts/EventContext";
import { UserProvider } from "@/contexts/UserContext";
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <UserProvider>
      <EventProvider>
        <AuthProvider>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: theme.colors.primary },
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
                title: "Create Club",
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
                title: "Create Event",
              }}
            />
            <Stack.Screen
              name="event-details"
              options={{
                headerShown: true,
                title: "Event Details",
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
                title: "Manage Club",
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
                title: "Manage Teams",
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
                title: "Add Members",
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
                title: "Manage Group",
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
                title: "Manage Subgroup",
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
                title: "Group Settings",
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
                title: "Club Settings",
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
                title: "Subscription",
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
                title: "Track Payments",
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
                title: "Subgroup Settings",
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
                title: "Add Member",
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
                title: "Add Youth Player",
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
                title: "Remove Member",
              }}
            />
            <Stack.Screen
              name="profile"
              options={{
                headerShown: true,
                title: "My Profile",
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
                title: "Statistics",
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
                title: "Payment Setup",
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
                title: "Create Fee",
                headerStyle: {
                  backgroundColor: theme.colors.primary,
                },
                headerTintColor: theme.colors.secondary,
                headerShadowVisible: false,
              }}
            />
          </Stack>
        </AuthProvider>
      </EventProvider>
    </UserProvider>
  );
}
