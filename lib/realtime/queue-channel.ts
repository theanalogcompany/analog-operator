import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { isFixtureMode } from '@/lib/api/queue';
import { subscribeQueueFixture } from '@/lib/fixtures/queue';
import { supabase } from '@/lib/supabase/client';

// Single canonical event variant. The consumer (`hooks/use-queue.ts`) always
// reloads on any event — the raw `messages` payload doesn't carry the JOINed
// PendingDraft fields the queue needs, so per-event surgical merging is not
// feasible. Keeping the type a union of one keeps the consumer pattern open
// to richer events in the future (e.g., a server-side single-row endpoint
// landing a fully-shaped PendingDraft) without breaking the call site today.
export type QueueChannelEvent = { type: 'queue_changed' };

export type QueueChannel = {
  unsubscribe: () => void;
};

export type QueueChannelOptions = {
  operatorId: string;
  venueIds: string[];
  accessToken: string;
  onEvent: (event: QueueChannelEvent) => void;
  onReconnect?: () => void;
};

function readDirection(row: unknown): string | null {
  if (row && typeof row === 'object' && 'direction' in row) {
    const value = (row as { direction: unknown }).direction;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/**
 * Returns a channel that emits live queue events. In fixture mode, delegates
 * to the in-memory emitter from `@/lib/fixtures/queue`. In live mode, opens a
 * Supabase Realtime postgres_changes subscription on the `messages` table
 * filtered to the operator's venue allowlist (the only thing keeping
 * cross-venue events out of an operator's stream while RLS is deferred — see
 * TAC-271).
 */
export function createQueueChannel(opts: QueueChannelOptions): QueueChannel {
  if (isFixtureMode()) {
    const unsub = subscribeQueueFixture(opts.onEvent);
    return { unsubscribe: unsub };
  }

  // No allowlisted venues = no events possible. Don't open a channel —
  // the queue endpoint will return [] and the empty state renders.
  if (opts.venueIds.length === 0) {
    return { unsubscribe: () => undefined };
  }

  // Threads the operator JWT into the realtime client so postgres_changes
  // is authenticated. Without this, subscriptions fail closed (no events
  // arrive); with the wrong JWT in v1 (no RLS), they would still match — so
  // this is correctness-critical, not security-critical, until TAC-271 lands.
  supabase.realtime.setAuth(opts.accessToken);

  const venueFilter = `venue_id=in.(${opts.venueIds.join(',')})`;
  let lastStatus: string | null = null;

  // Supabase Realtime accepts only one filter clause per `.on()` call. The
  // server-side `venue_id=in.(...)` filter is the security gate; everything
  // else is post-filtered in JS. We post-filter on `direction === 'outbound'`
  // only — keeping `review_state` out of the filter so pending → sent /
  // skipped / approved transitions also trigger a refetch (those drop the
  // card from the queue).
  const handle = (
    payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>,
  ): void => {
    const direction = readDirection(payload.new) ?? readDirection(payload.old);
    if (direction !== 'outbound') return;
    opts.onEvent({ type: 'queue_changed' });
  };

  const channel: RealtimeChannel = supabase
    .channel(`operator-queue-${opts.operatorId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: venueFilter,
      },
      handle,
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: venueFilter,
      },
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
