// Conversations data lives here, not in a hook call inside each screen, so
// the /conversations stack's list screen and thread screen share ONE
// useConversations() instance (one fetch, one realtime subscription)
// instead of each screen mounting its own. Mirrors lib/queue-context.tsx's
// exact pattern, but scoped to the /conversations route group only —
// conversations data isn't needed outside that group (unlike the queue
// count, which appears in both tab headers and is lifted to the app root).

import { createContext, useContext, type ReactNode } from 'react';

import { type UseConversationsResult, useConversations } from '@/hooks/use-conversations';

const ConversationsContext = createContext<UseConversationsResult | null>(null);

export function useConversationsContext(): UseConversationsResult {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error('useConversationsContext must be used inside <ConversationsProvider>');
  }
  return ctx;
}

// No `enabled`/session gating needed here (unlike QueueProvider) — this
// provider only ever mounts inside app/conversations/_layout.tsx, which is
// itself only reachable through the already-auth-gated
// `Stack.Protected guard={isSignedIn}` block in app/_layout.tsx, so by the
// time it mounts the operator is already known to be signed in.
export function ConversationsProvider({ children }: { children: ReactNode }) {
  const conversations = useConversations();
  return (
    <ConversationsContext.Provider value={conversations}>{children}</ConversationsContext.Provider>
  );
}
