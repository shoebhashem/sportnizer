import { AuthProvider } from '@/contexts/AuthContext';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
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
      </Stack>
    </AuthProvider>
  );
}
