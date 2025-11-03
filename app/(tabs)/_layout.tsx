import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { theme } from '@/constants/theme';
import { useUserGroups } from '@/contexts/UserContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TabLayout() {
  const userGroups = useUserGroups();
  
  // Check if user has admin or coach role in any group
  const canManage = userGroups.some(group => 
    group.roles?.some((role: string) => 
      role.toLowerCase() === 'admin' || role.toLowerCase() === 'coach'
    )
  );
  
  return (
    <AuthGuard>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
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
              height: 55,
              // Safe area automatically handled by SafeAreaView
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
      </SafeAreaView>
    </AuthGuard>
  );
}
