import AdContainer from '@/components/AdContainer';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { theme } from '@/constants/theme';
import { useEventPermissions } from '@/utils/roleUtils';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

export default function TabLayout() {
  const adHeight = Platform.OS === 'web' ? 100 : 70;
  const { canCreateEvents, loading } = useEventPermissions();
  
  return (
    <AuthGuard>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.colors.secondary,
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerShadowVisible: false,
          headerTintColor: theme.colors.white,
          headerRight: () => <UserAvatar />,
          tabBarStyle: {
            backgroundColor: theme.colors.primary,
            marginBottom: adHeight, // Make room for the ad
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
            ),
          }}
        />
        {/* Conditional Calendar Tab - Only show for admins/coaches */}
        {!loading && canCreateEvents && (
          <Tabs.Screen
            name="events"
            options={{
              title: 'Events',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={24} />
              ),
            }}
          />
        )}
        <Tabs.Screen
          name="groups"
          options={{
            title: 'Groups',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} color={color} size={24} />
            ),
          }}
        />
        <Tabs.Screen
          name="about"
          options={{
            title: 'About',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'information-circle' : 'information-circle-outline'} color={color} size={24}/>
            ),
          }}
        />
      </Tabs>
      <AdContainer position="bottom" />
    </AuthGuard>
  );
}
