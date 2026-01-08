import { Stack } from 'expo-router';

export default function InvitationLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="accept" />
      <Stack.Screen name="reject" />
    </Stack>
  );
}
