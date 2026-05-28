import { useEffect } from 'react';

import { useSession } from '@/lib/auth/use-session';
import type { ThreadMessage } from '@/lib/api/queue';
import { createThreadChannel } from '@/lib/realtime/thread-channel';

export type UseThreadRealtimeOptions = {
  venueId: string;
  guestId: string;
  onInsert: (message: ThreadMessage) => void;
  onUpdate: (message: ThreadMessage) => void;
};

/**
 * Subscribes to the open-thread Realtime channel for the lifetime of the
 * host component. Per-mount lifecycle — subscribes on mount, unsubscribes
 * on unmount, and re-subscribes when the Supabase access token rotates
 * (token refresh resets the channel; v1 accepts the cost since pilot
 * session length keeps refresh count bounded). Mirrors `useQueueRealtime`.
 */
export function useThreadRealtime(opts: UseThreadRealtimeOptions): void {
  const session = useSession();
  const accessToken = session.session?.access_token ?? null;
  const { venueId, guestId, onInsert, onUpdate } = opts;

  useEffect(() => {
    // Empty venueId/guestId means the host screen rendered without a draft
    // (the not-found branch in `app/queue/edit.tsx` returns early; this hook
    // still gets called because React requires unconditional hook order).
    // No-op in that case so we don't open a channel with a malformed
    // `venue_id=eq.` filter.
    if (!accessToken || !venueId || !guestId) return;

    // `createThreadChannel` is synchronous — no `cancelled` flag needed
    // (queue-realtime uses one because it awaits operator/venue lookups
    // before subscribing; thread-realtime has the venueId/guestId in-hand).
    const channel = createThreadChannel({
      venueId,
      guestId,
      accessToken,
      onInsert,
      onUpdate,
    });

    return () => {
      channel.unsubscribe();
    };
  }, [accessToken, venueId, guestId, onInsert, onUpdate]);
}
