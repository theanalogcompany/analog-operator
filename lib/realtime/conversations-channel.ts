// Mirrors lib/realtime/queue-channel.ts, but with no direction post-filter —
// the Conversations tab cares about ANY message activity (inbound or
// outbound), unlike the queue channel which only reloads on outbound
// review-state-relevant changes.

import type { RealtimeChannel } from '@supabase/supabase-js';

import { isFixtureMode } from '@/lib/api/queue';
import { subscribeConversationsFixture } from '@/lib/fixtures/conversations';
import { supabase } from '@/lib/supabase/client';

export type ConversationsChannelEvent = { type: 'conversations_changed' };

export type ConversationsChannel = {
  unsubscribe: () => void;
};

export type ConversationsChannelOptions = {
  operatorId: string;
  venueIds: string[];
  accessToken: string;
  onEvent: (event: ConversationsChannelEvent) => void;
  onReconnect?: () => void;
};

export function createConversationsChannel(
  opts: ConversationsChannelOptions,
): ConversationsChannel {
  if (isFixtureMode()) {
    const unsub = subscribeConversationsFixture(opts.onEvent);
    return { unsubscribe: unsub };
  }

  if (opts.venueIds.length === 0) {
    return { unsubscribe: () => undefined };
  }

  supabase.realtime.setAuth(opts.accessToken);

  const venueFilter = `venue_id=in.(${opts.venueIds.join(',')})`;
  let lastStatus: string | null = null;

  const handle = (): void => {
    opts.onEvent({ type: 'conversations_changed' });
  };

  const channel: RealtimeChannel = supabase
    .channel(`operator-conversations-${opts.operatorId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: venueFilter },
      handle,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: venueFilter },
      handle,
    )
    .subscribe((status) => {
      const reconnected =
        (lastStatus === 'CHANNEL_ERROR' ||
          lastStatus === 'TIMED_OUT' ||
          lastStatus === 'CLOSED') &&
        status === 'SUBSCRIBED';
      lastStatus = status;
      if (reconnected) opts.onReconnect?.();
    });

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
