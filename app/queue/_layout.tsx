// app/queue/_layout.tsx
import { Stack } from 'expo-router';

export default function QueueLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="edit"
        options={{ presentation: 'modal', animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
