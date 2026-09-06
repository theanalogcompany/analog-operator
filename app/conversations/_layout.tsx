// app/conversations/_layout.tsx
import { Stack } from 'expo-router';

export default function ConversationsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[guestId]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
