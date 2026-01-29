import AuthGuard from '@/components/AuthGuard';
import UserAvatar from '@/components/UserAvatar';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/contexts/UserContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { user } = useAuth();
  const { userProfile, isLoading } = useUserProfile();
  
  // Wait for userProfile to load before making redirect decisions
  if (isLoading) {
    return null; // or a loading spinner
  }
  
  // Redirect based on auth state and club membership
  if (!user) {
    // Not authenticated - show welcome screen
    return <Redirect href="/welcome" />;
  }
  
  if (!userProfile?.clubAccess || userProfile.clubAccess.length === 0) {
    // Authenticated but no clubs - redirect directly to create club form
    return <Redirect href="/create-club-form" />;
  }
  
  // Extract groups from nested groupAccess within each club
  const userGroups = React.useMemo(() => {
    if (!userProfile?.clubAccess) return [];
    
    const allGroups = [];
    for (const clubAccess of userProfile.clubAccess) {
      if (clubAccess.groupAccess) {
        for (const groupAccess of clubAccess.groupAccess) {
          allGroups.push(groupAccess);
        }
      }
    }
    return allGroups;
  }, [userProfile?.clubAccess]);
  
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
              height: 60,
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
