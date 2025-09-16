import AdContainer from '@/components/AdContainer';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
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
          tabBarActiveTintColor: '#ffd33d',
          headerStyle: {
            backgroundColor: '#25292e',
          },
          headerShadowVisible: false,
          headerTintColor: '#fff',
          headerRight: () => <UserAvatar />,
          tabBarStyle: {
            backgroundColor: '#25292e',
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
