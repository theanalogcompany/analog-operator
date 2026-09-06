import { useEffect } from 'react';

import { fetchOperatorVenueIds, getOperator } from '@/lib/auth/operator';
import { useSession } from '@/lib/auth/use-session';
import {
  type ConversationsChannelEvent,
  createConversationsChannel,
} from '@/lib/realtime/conversations-channel';

export function useConversationsRealtime(
  onEvent: (event: ConversationsChannelEvent) => void,
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

      const venuesResult = await fetchOperatorVenueIds(operatorResult.operator.id);
      if (cancelled || !venuesResult.ok) return;

      const channel = createConversationsChannel({
        operatorId: operatorResult.operator.id,
        venueIds: venuesResult.venueIds,
        accessToken,
        onEvent,
        onReconnect: () => onEvent({ type: 'conversations_changed' }),
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
