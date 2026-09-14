// Conversations data lives here, not in a hook call inside each screen, so
// the /conversations stack's list screen and thread screen share ONE
// useConversations() instance (one fetch, one realtime subscription)
// instead of each screen mounting its own. Mirrors lib/queue-context.tsx's
// exact pattern, but scoped to the /conversations route group only —
// conversations data isn't needed outside that group (unlike the queue
// count, which appears in both tab headers and is lifted to the app root).
//
// Venue filtering happens here for the same reason it happens in
// queue-context: the list screen's three aggregate counts, the type-filter
// menu and the thread screen's guest lookup all read `conversations` from
// this context, so filtering once covers every one of them (TAC-382).

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  type UseConversationsResult,
  useConversations,
} from '@/hooks/use-conversations';
import { type VenueSelectionValue, useVenueSelection } from '@/lib/venue-context';
import { filterByVenue } from '@/lib/venue-filter';

const ConversationsContext = createContext<UseConversationsResult | null>(null);

export function useConversationsContext(): UseConversationsResult {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error('useConversationsContext must be used inside <ConversationsProvider>');
  }
  return ctx;
}

/**
 * Narrow a conversations result to one venue. Same status precedence as
 * `scopeQueueToVenue` — see the reasoning there; the two must agree or the
 * two tabs disagree about whether the app is still loading.
 */
function scopeConversationsToVenue(
  result: UseConversationsResult,
  venue: Pick<VenueSelectionValue, 'selectedVenueId' | 'status'>,
): UseConversationsResult {
  return {
    ...result,
    conversations: filterByVenue(result.conversations, venue.selectedVenueId),
    status:
      venue.status === 'ready'
        ? result.status
        : venue.status === 'error'
          ? 'error'
          : 'loading',
  };
}

// No `enabled`/session gating needed here (unlike QueueProvider) — this
// provider only ever mounts inside app/conversations/_layout.tsx, which is
// itself only reachable through the already-auth-gated
// `Stack.Protected guard={isSignedIn}` block in app/_layout.tsx, so by the
// time it mounts the operator is already known to be signed in.
export function ConversationsProvider({ children }: { children: ReactNode }) {
  const conversations = useConversations();
  const venue = useVenueSelection();
  const value = useMemo(
    () => scopeConversationsToVenue(conversations, venue),
    [conversations, venue],
  );
  return (
    <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>
  );
}
