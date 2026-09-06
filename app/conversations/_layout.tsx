// app/conversations/_layout.tsx
import { Stack } from 'expo-router';

import { ConversationsProvider } from '@/lib/conversations-context';

export default function ConversationsLayout() {
  return (
    <ConversationsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[guestId]" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </ConversationsProvider>
  );
}
