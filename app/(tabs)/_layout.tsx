import AdContainer from '@/components/AdContainer';
import AuthGuard from '@/components/AuthGuard';
import { useEventPermissions } from '@/utils/roleUtils';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TabLayout() {
  const adHeight = Platform.OS === 'web' ? 100 : 70;
  const { canCreateEvents, loading } = useEventPermissions();
  
  return (
    <AuthGuard>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Tabs
            screenOptions={{
              tabBarActiveTintColor: '#ffd33d',
              headerStyle: {
                backgroundColor: '#25292e',
              },
              headerShadowVisible: false,
              headerTintColor: '#fff',
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
          <View style={styles.adContainer}>
            <AdContainer position="bottom" />
          </View>
        </View>
      </SafeAreaView>
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  adContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
