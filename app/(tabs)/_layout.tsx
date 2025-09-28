import AdContainer from '@/components/AdContainer';
import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { theme } from '@/constants/theme';
import { useUserGroups } from '@/contexts/UserContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

export default function TabLayout() {
  const adHeight = Platform.OS === 'web' ? 100 : 70;
  const userGroups = useUserGroups();
  
  // Check if user has admin or coach role in any group
  const canManage = userGroups.some(group => 
    group.roles?.some(role => 
      role.toLowerCase() === 'admin' || role.toLowerCase() === 'coach'
    )
  );
  
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
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
            ),
          }}
        />
        {/* Conditional Manage Tab - Only show for admins/coaches */}
        {canManage && (
          <Tabs.Screen
            name="manage"
            options={{
              title: 'Manage',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={24} />
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
