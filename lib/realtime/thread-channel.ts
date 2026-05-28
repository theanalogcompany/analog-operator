import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { z } from 'zod';

import { type ThreadMessage, ThreadMessageSchema, isFixtureMode } from '@/lib/api/queue';
import { subscribeThreadFixture } from '@/lib/fixtures/queue';
import { supabase } from '@/lib/supabase/client';

// Direct row shape from postgres_changes on `messages`. The wire shape is
// snake_case (`created_at`, `guest_id`); we lift the fields the consumer
// cares about into our camelCase `ThreadMessage` type before invoking the
// callbacks. Tolerant Zod: ignore unknown fields so additive server columns
// (langfuse_trace_id, review_state, etc.) don't crash the channel.
const MessageRowSchema = z.object({
  id: z.string(),
  venue_id: z.string(),
  guest_id: z.string(),
  direction: z.string(),
  body: z.string(),
  created_at: z.string(),
});
type MessageRow = z.infer<typeof MessageRowSchema>;

function rowToMessage(row: MessageRow): ThreadMessage | null {
  // Direction must be one of the literal-union values — anything else means
  // the row isn't a renderable bubble (server-side defensive check; this
  // shouldn't happen in practice with the current schema).
  if (row.direction !== 'inbound' && row.direction !== 'outbound') return null;
  const parsed = ThreadMessageSchema.safeParse({
    id: row.id,
    direction: row.direction,
    body: row.body,
    createdAt: row.created_at,
  });
  return parsed.success ? parsed.data : null;
}

function parseRow(raw: unknown): MessageRow | null {
  const parsed = MessageRowSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type ThreadChannelEvent =
  | { type: 'message_inserted'; message: ThreadMessage }
  | { type: 'message_updated'; message: ThreadMessage };

export type ThreadChannel = {
  unsubscribe: () => void;
};

export type ThreadChannelOptions = {
  venueId: string;
  guestId: string;
  accessToken: string;
  onInsert: (message: ThreadMessage) => void;
  onUpdate: (message: ThreadMessage) => void;
};

/**
 * Opens a Realtime postgres_changes subscription on `messages` scoped to the
 * open guest-at-venue thread. Mirrors `lib/realtime/queue-channel.ts`:
 * single server-side filter clause (`venue_id=eq.<venueId>`) plus JS-side
 * post-filter for `guest_id` (Realtime accepts only one filter per `.on()`).
 *
 * Realtime singleton note: `supabase.realtime.setAuth(accessToken)` mutates
 * the shared singleton across all channels. Both this and `queue-channel`
 * read the same JWT from `useSession()`, so concurrent setAuth calls are
 * idempotent and benign — but if a future third channel needs a different
 * token, plumb the JWT to all sites so neither stomps on the others.
 */
export function createThreadChannel(opts: ThreadChannelOptions): ThreadChannel {
  if (isFixtureMode()) {
    const unsub = subscribeThreadFixture((event) => {
      if (event.type === 'message_inserted') opts.onInsert(event.message);
      else if (event.type === 'message_updated') opts.onUpdate(event.message);
    });
    return { unsubscribe: unsub };
  }

  // Same auth pattern as queue-channel.ts — without it, Realtime
  // subscriptions fail closed (no events arrive) once row-level auth is
  // enforced. Until TAC-271 ships RLS, this is correctness-critical (the
  // postgres_changes server enforces realtime.* authorization checks even
  // pre-RLS), not the venue-scoping security gate; that gate is the
  // server-side `venue_id=eq.<venueId>` filter below.
  supabase.realtime.setAuth(opts.accessToken);

  const venueFilter = `venue_id=eq.${opts.venueId}`;

  const handle = (
    payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>,
    kind: 'INSERT' | 'UPDATE',
  ): void => {
    const row = parseRow(payload.new);
    if (!row) return;
    // Post-filter: the server filter scopes to venue, but the same operator
    // may have multiple open conversations on the same venue. Only emit if
    // the row matches the open guest.
    if (row.guest_id !== opts.guestId) return;
    const message = rowToMessage(row);
    if (!message) return;
    if (kind === 'INSERT') opts.onInsert(message);
    else opts.onUpdate(message);
  };

  const channel: RealtimeChannel = supabase
    .channel(`thread:${opts.venueId}:${opts.guestId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: venueFilter,
      },
      (payload) => handle(payload, 'INSERT'),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: venueFilter,
      },
      (payload) => handle(payload, 'UPDATE'),
    )
    .subscribe();

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
