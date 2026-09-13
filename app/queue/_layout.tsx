// app/queue/_layout.tsx
import { Stack } from 'expo-router';

export default function QueueLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* A fade, not a push. The design draws the takeover as a full-screen
          overlay whose ground is the card's ground; keeping it as a real route
          (513 lines of tests, params, its own realtime channel) and fading it
          in gets the ground dissolving in place, which is most of what the
          overlay bought. */}
      <Stack.Screen
        name="edit"
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
    </Stack>
  );
}
