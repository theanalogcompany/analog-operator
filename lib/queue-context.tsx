// lib/queue-context.tsx
// Queue data lives here, not in app/queue/_layout.tsx, so both the /queue
// stack and the new /conversations stack can read the same live queue count
// (the tab header shows it on both screens) without opening a second
// listQueue() fetch or a second realtime subscription.

import { createContext, useContext, type ReactNode } from 'react';

import { type UseQueueResult, useQueue } from '@/hooks/use-queue';
import { useSession } from '@/lib/auth/use-session';

const QueueContext = createContext<UseQueueResult | null>(null);

export function useQueueContext(): UseQueueResult {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error('useQueueContext must be used inside <QueueProvider>');
  }
  return ctx;
}

// `enabled` mirrors the exact pre-lift behavior: the queue only ever fetched
// once an operator was signed in (it used to only mount once expo-router
// entered the auth-gated /queue stack). QueueProvider now always mounts, so
// the gate moves inside instead of relying on conditional mounting.
export function QueueProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const queue = useQueue({ enabled: session.status === 'signed-in' });
  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>;
}
