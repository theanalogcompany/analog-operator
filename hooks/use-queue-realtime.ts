import { useEffect } from 'react';

import { fetchOperatorVenueIds, getOperator } from '@/lib/auth/operator';
import { useSession } from '@/lib/auth/use-session';
import {
  type QueueChannelEvent,
  createQueueChannel,
} from '@/lib/realtime/queue-channel';

/**
 * Subscribes to the queue realtime channel for the lifetime of the host
 * component and forwards every event to `onEvent`. Per-mount lifecycle —
 * subscribes on mount, unsubscribes on unmount, and re-subscribes when the
 * Supabase access token rotates (token refresh resets the channel; v1
 * accepts the cost since pilot session length keeps refresh count bounded).
 *
 * The hook never touches edit-takeover input state — that lives in a separate
 * component's local state, structurally insulated from this stream.
 */
export function useQueueRealtime(
  onEvent: (event: QueueChannelEvent) => void,
): void {
  const session = useSession();
  const accessToken = session.session?.access_token ?? null;

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const operatorResult = await getOperator();
      if (cancelled || !operatorResult.ok) return;

      const venuesResult = await fetchOperatorVenueIds(
        operatorResult.operator.id,
      );
      if (cancelled || !venuesResult.ok) return;

      const channel = createQueueChannel({
        operatorId: operatorResult.operator.id,
        venueIds: venuesResult.venueIds,
        accessToken,
        onEvent,
        onReconnect: () => onEvent({ type: 'queue_changed' }),
      });

      if (cancelled) {
        channel.unsubscribe();
        return;
      }
      unsubscribe = channel.unsubscribe;
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [accessToken, onEvent]);
}
