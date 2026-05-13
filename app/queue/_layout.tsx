import { Stack } from 'expo-router';
import { createContext, useContext } from 'react';

import { type UseQueueResult, useQueue } from '@/hooks/use-queue';

const QueueContext = createContext<UseQueueResult | null>(null);

export function useQueueContext(): UseQueueResult {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error('useQueueContext must be used inside the /queue layout');
  }
  return ctx;
}

export default function QueueLayout() {
  const queue = useQueue();
  return (
    <QueueContext.Provider value={queue}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="edit"
          options={{ presentation: 'modal', animation: 'slide_from_right' }}
        />
      </Stack>
    </QueueContext.Provider>
  );
}
