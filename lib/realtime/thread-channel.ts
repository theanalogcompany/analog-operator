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
// (langfuse_trace_id, generation_id, etc.) don't crash the channel.
//
// `status` and `review_state` are `.nullable().optional()` ON PURPOSE. Do not
// tighten them (TAC-411).
//
// Both are real columns and postgres_changes sends every column, so in
// practice neither is absent. `status` is NOT NULL and constrained to
// `received | draft | pending_review | approved | sending | sent | delivered |
// failed | rejected` (the column's `'pending'` default is dead — the CHECK
// constraint excludes it, so no row can hold it). `review_state` is nullable,
// and NULL on every inbound row.
//
// The looseness is not about what the server sends; it is about which way
// this module fails if that ever stops being true. Required fields would make
// `parseRow` return null on such a row, `handle` return early, and a pending
// draft ALREADY ON SCREEN stay there silently — which is the exact defect
// this ticket exists to kill. Loose lets the row reach `countsAsThreadRow`,
// fail it, and emit a removal. Failing toward removal is the correct
// direction: a counting message wrongly dropped reappears on the next fetch,
// whereas a pending draft wrongly kept reads to the operator as already sent
// and the guest gets no reply. Same reasoning as `filterByVenue` returning []
// rather than the unfiltered list on a null selection (CLAUDE.md, Venue
// scoping).
//
// The remaining fields are still required, so the early-return hole survives
// for them: a row with a malformed `created_at`, or no `venue_id`, is dropped
// before the condition and removes nothing. That is narrower than the status
// fields (those two are the ones the condition reads) but it is not closed.
const MessageRowSchema = z.object({
  id: z.string(),
  venue_id: z.string(),
  guest_id: z.string(),
  direction: z.string(),
  body: z.string(),
  created_at: z.string(),
  status: z.string().nullable().optional(),
  review_state: z.string().nullable().optional(),
});
type MessageRow = z.infer<typeof MessageRowSchema>;

/**
 * The outbound statuses that mean the message reached the guest.
 *
 * `sending` counts: Sendblue's callbacks arrive out of order and can leave a
 * message the guest did receive sitting at `sending` (TAC-395 Contract,
 * "Which messages count"). Mirrors `DELIVERED_OUTBOUND_STATUSES` in
 * analog-guest's `lib/agent/group-responses.ts`, which is the server-side
 * binding of the same list.
 */
const DELIVERED_OUTBOUND_STATUSES = ['sending', 'sent', 'delivered'];

/**
 * Whether a live `messages` row belongs in an open thread.
 *
 * Transcribed from TAC-395's `## Contract`, "Which messages count" — a row
 * counts when BOTH hold:
 *
 *   1. `body <> ''`
 *   2. `direction = 'inbound' OR (review_state IS DISTINCT FROM 'pending'
 *       AND status IN ('sending', 'sent', 'delivered'))`
 *
 * Inbound is decided by `direction` alone: every inbound row has a NULL
 * `review_state`, so testing `review_state` on all rows would drop every
 * inbound message. `review_state !== 'pending'` reproduces SQL's
 * `IS DISTINCT FROM` for both null and undefined.
 *
 * Exported and pure so the decision is testable without driving a Realtime
 * channel — the TAC-312 lesson: when a bug escapes, the layer that was
 * mocked is the test file you were missing.
 */
export function countsAsThreadRow(row: {
  direction: string;
  body: string;
  status?: string | null;
  review_state?: string | null;
}): boolean {
  if (row.body === '') return false;
  if (row.direction === 'inbound') return true;
  return (
    row.review_state !== 'pending' &&
    DELIVERED_OUTBOUND_STATUSES.includes(row.status ?? '')
  );
}

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
  | { type: 'message_updated'; message: ThreadMessage }
  | { type: 'message_removed'; id: string };

export type ThreadChannel = {
  unsubscribe: () => void;
};

export type ThreadChannelOptions = {
  venueId: string;
  guestId: string;
  accessToken: string;
  onInsert: (message: ThreadMessage) => void;
  onUpdate: (message: ThreadMessage) => void;
  /** A row that stopped counting (or never counted) leaves the thread by id.
   *  The server does not filter this channel — see the Realtime section of
   *  TAC-395's Contract. (TAC-411.) */
  onRemove: (id: string) => void;
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
      else if (event.type === 'message_removed') opts.onRemove(event.id);
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

    // The server does not filter this channel; the app applies the Contract's
    // condition to every live row (TAC-395 Contract, Realtime). A row that
    // stops counting — a send that later fails, a body blanked, an approved
    // reply regenerated back into `pending` — leaves the thread by id rather
    // than lingering until the screen is reopened. (TAC-411.)
    if (!countsAsThreadRow(row)) {
      opts.onRemove(row.id);
      return;
    }

    // `rowToMessage` returns null only for a direction outside the literal
    // union, which cannot be rendered as a bubble. That is also a row that
    // does not belong in the thread, so it removes rather than being dropped
    // silently before the decision.
    const message = rowToMessage(row);
    if (!message) {
      opts.onRemove(row.id);
      return;
    }
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
