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
              name="create-poll"
              options={{
                headerShown: false,
                title: "Create Poll",
              }}
            />
            <Stack.Screen
              name="create-recurring-event"
              options={{
                headerShown: false,
                title: "Create Recurring Event",
              }}
            />
            <Stack.Screen
              name="select-recipients"
              options={{
                headerShown: false,
                title: "Select Recipients",
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
                headerShown: false,
                title: "Manage Group",
              }}
            />
            <Stack.Screen
              name="group-settings"
              options={{
                headerShown: false,
                title: "Group Settings",
              }}
            />
            <Stack.Screen
              name="add-member-type"
              options={{
                headerShown: false,
                title: "Add Member Type",
              }}
            />
            <Stack.Screen
              name="manage-members"
              options={{
                headerShown: false,
                title: "Manage Members",
              }}
            />
            <Stack.Screen
              name="remove-member"
              options={{
                headerShown: false,
                title: "Remove Member",
              }}
            />
          </Stack>
        </AuthProvider>
      </EventProvider>
    </UserProvider>
  );
}
