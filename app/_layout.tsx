import { AuthProvider } from '@/contexts/AuthContext';
import { UserProvider } from '@/contexts/UserContext';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <UserProvider>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen 
          name="create-group" 
          options={{ 
            headerShown: true,
            title: 'Create Group',
            headerStyle: {
              backgroundColor: '#25292e',
            },
            headerTintColor: '#fff',
          }} 
        />
        <Stack.Screen 
          name="create-event" 
          options={{ 
            headerShown: false,
            title: 'Create Event'
          }} 
        />
        <Stack.Screen 
          name="create-poll" 
          options={{ 
            headerShown: false,
            title: 'Create Poll'
          }} 
        />
        <Stack.Screen 
          name="create-recurring-event" 
          options={{ 
            headerShown: false,
            title: 'Create Recurring Event'
          }} 
        />
        <Stack.Screen 
          name="select-recipients" 
          options={{ 
            headerShown: false,
            title: 'Select Recipients'
          }} 
        />
        <Stack.Screen 
          name="manageteams" 
          options={{ 
            headerShown: true,
            title: 'Manage Teams',
            headerStyle: {
              backgroundColor: '#25292e',
            },
            headerTintColor: '#fff',
          }} 
        />
        <Stack.Screen 
          name="addmembers" 
          options={{ 
            headerShown: true,
            title: 'Add Members',
            headerStyle: {
              backgroundColor: '#25292e',
            },
            headerTintColor: '#fff',
          }} 
        />
      </Stack>
      </AuthProvider>
    </UserProvider>
  );
}
