import {
  type DeclineCommitmentResult,
  type GuestChannel,
  type HeadsUpCommitment,
  type PendingDraft,
  type RecognitionState,
  type ThreadMessage,
} from '@/lib/api/queue';
import { type ApiError, type Result, err, ok } from '@/lib/api/errors';
import { DISPLAY_MARGIN_MS } from '@/lib/reply-window';
import {
  FIXTURE_CENTRAL_PERK_ID,
  FIXTURE_SEXTANT_ID,
  FIXTURE_VENUES,
} from '@/lib/fixtures/venues';
// import type only — avoids a circular import with the realtime channels,
// which import subscribe*Fixture from this file.
import type { QueueChannelEvent } from '@/lib/realtime/queue-channel';
import type { ThreadChannelEvent } from '@/lib/realtime/thread-channel';

type Subscriber = (event: QueueChannelEvent) => void;
type ThreadSubscriber = (event: ThreadChannelEvent) => void;

type ArchiveEntry = {
  draft: PendingDraft;
  reason: 'approved' | 'edited' | 'skipped';
  edited_body?: string;
};

const hexChars = '0123456789abcdef';
const variantChars = '89ab';

/** Generates a non-cryptographic UUIDv4 — fine for fixtures, satisfies Zod 4 strict. */
function fixtureUuid(): string {
  const rand = (chars: string): string =>
    chars[Math.floor(Math.random() * chars.length)];
  const block = (len: number): string => {
    let out = '';
    for (let i = 0; i < len; i++) out += rand(hexChars);
    return out;
  };
  return `${block(8)}-${block(4)}-4${block(3)}-${rand(variantChars)}${block(3)}-${block(12)}`;
}

const draft = (args: {
  messageId: string;
  venueId: string;
  venueSlug: string;
  guestId: string;
  guestDisplayName: string | null;
  guestPhoneFallback: string;
  recognitionState: RecognitionState | null;
  agentReasoning: string | null;
  recentContext: {
    id: string;
    body: string;
    direction: 'inbound' | 'outbound';
    minsAgo: number;
  }[];
  draftBody: string;
  category: string | null;
  voiceFidelity: number | null;
  reviewReason: string | null;
  reviewReasonCode?: string;
  reviewTriggers?: string[];
  reviewTriggerLabels?: string[];
  ungroundedClaims?: string[];
  pendingMinutes: number;
  /**
   * Instagram fields (TAC-473 Contract). Default to a text guest so every seed
   * written before TAC-486 keeps rendering exactly as it did.
   *
   * `windowMinutesLeft` is how much window the card should SHOW, so a seed
   * reads in the units the operator sees. The display margin is added back on
   * here, because `windowState` subtracts it. `null` leaves the deadline null,
   * which on an Instagram guest means "unknown", not expired.
   */
  guestChannel?: GuestChannel;
  instagramUsername?: string | null;
  windowMinutesLeft?: number | null;
  replacedDraft?: { body: string; replacedAt: string } | null;
}): PendingDraft => {
  const now = Date.now();
  return {
    messageId: args.messageId,
    venueId: args.venueId,
    venueSlug: args.venueSlug,
    venueTimezone: null,
    guestId: args.guestId,
    guestDisplayName: args.guestDisplayName,
    guestPhoneFallback: args.guestPhoneFallback,
    guestChannel: args.guestChannel ?? 'text',
    replyWindowExpiresAt:
      args.windowMinutesLeft === undefined || args.windowMinutesLeft === null
        ? null
        : new Date(
            now + args.windowMinutesLeft * 60_000 + DISPLAY_MARGIN_MS,
          ).toISOString(),
    instagramUsername: args.instagramUsername ?? null,
    replacedDraft: args.replacedDraft ?? null,
    draftBody: args.draftBody,
    category: args.category,
    voiceFidelity: args.voiceFidelity,
    reviewReason: args.reviewReason,
    reviewReasonCode: args.reviewReasonCode ?? '',
    reviewTriggers: args.reviewTriggers ?? [],
    reviewTriggerLabels: args.reviewTriggerLabels ?? [],
    ungroundedClaims: args.ungroundedClaims ?? [],
    recognitionState: args.recognitionState,
    agentReasoning: args.agentReasoning,
    pendingSinceMs: args.pendingMinutes * 60_000,
    recentContext: args.recentContext.map((m) => ({
      id: m.id,
      body: m.body,
      direction: m.direction,
      createdAt: new Date(now - m.minsAgo * 60_000).toISOString(),
    })),
    langfuseTraceId: null,
  };
};

// The reason codes and labels are the server's own (analog-guest
// `REVIEW_REASON_LABELS`). Between them the four drafts reach all four draft
// grounds offline, and the heads-up seeds below reach the fifth. One card
// carries a secondary trigger and one a flagged claim, so the review detail
// renders without a backend. (TAC-364.)
function seedDrafts(): PendingDraft[] {
  return [
    draft({
      messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      venueSlug: 'mock-sextant-coffee-roasters',
      guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guestDisplayName: 'Maya R.',
      guestPhoneFallback: '+15551110001',
      recognitionState: 'returning',
      agentReasoning:
        "She's confirming the table, not just asking — voice is clipped and warm. Match the energy, hold the corner spot.",
      recentContext: [
        {
          id: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          body: 'Hi! Is the patio open tonight?',
          direction: 'inbound',
          minsAgo: 18,
        },
        {
          id: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          body: "Yes — patio's open until 9. Want me to hold a corner table?",
          direction: 'outbound',
          minsAgo: 17,
        },
        {
          id: 'dd11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          body: 'Yes please! Two of us at 7:30 if you can swing it.',
          direction: 'inbound',
          minsAgo: 4,
        },
      ],
      draftBody:
        "Done — got you down for two at 7:30. The corner spot by the olive tree. See you tonight.",
      category: 'reservation',
      voiceFidelity: 0.72,
      reviewReason: 'Held behind an earlier message to this guest.',
      reviewReasonCode: 'previous_pending_held',
      reviewTriggers: ['previous_pending_held', 'fidelity_below_auto_send_floor'],
      reviewTriggerLabels: [
        'Held behind an earlier message to this guest.',
        "This doesn't sound enough like you.",
      ],
      pendingMinutes: 4,
    }),
    draft({
      messageId: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
      venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      venueSlug: 'mock-sextant-coffee-roasters',
      guestId: 'bb22e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
      guestDisplayName: null,
      guestPhoneFallback: '+15551110002',
      recognitionState: 'new',
      agentReasoning: null,
      recentContext: [
        {
          id: 'ee22e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
          body: 'do you guys do gluten free pasta',
          direction: 'inbound',
          minsAgo: 11,
        },
      ],
      draftBody:
        "We do — we keep a gluten-free penne behind the bar and run it through clean water. Just let your server know.",
      category: 'menu',
      voiceFidelity: 0.81,
      reviewReason: "I wasn't sure this was true, so I didn't send it.",
      reviewReasonCode: 'knowledge_gap_backstop',
      reviewTriggers: ['knowledge_gap_backstop'],
      reviewTriggerLabels: ["I wasn't sure this was true, so I didn't send it."],
      ungroundedClaims: [
        'we keep a gluten-free penne behind the bar and run it through clean water',
      ],
      pendingMinutes: 11,
    }),
    draft({
      messageId: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
      venueId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      venueSlug: 'mock-central-perk',
      guestId: 'cc33f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
      guestDisplayName: 'Devon L.',
      guestPhoneFallback: '+15551110003',
      recognitionState: 'raving_fan',
      agentReasoning:
        'Parents in town for one night, hoping for the rosemary loaf at 7. Lean into the occasion — the buckwheat slice is a fair gesture.',
      recentContext: [
        {
          id: 'ff33f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
          body: "Bringing my parents tomorrow — they're only in town one night.",
          direction: 'inbound',
          minsAgo: 38,
        },
        {
          id: 'aa44f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
          body: 'Any chance you have the rosemary loaf coming out around 7?',
          direction: 'inbound',
          minsAgo: 22,
        },
      ],
      draftBody:
        "We'll time a loaf for 7 — and there'll be a slice of the buckwheat cake for the table on us, since tomorrow's the day. Looking forward to meeting them.",
      category: 'reservation',
      voiceFidelity: 0.93,
      reviewReason: 'This offers something free. Your call.',
      reviewReasonCode: 'commitment_type_gated',
      reviewTriggers: ['commitment_type_gated', 'comp_regex_backstop'],
      reviewTriggerLabels: [
        'This offers something free. Your call.',
        "This sounds like it's offering something on the house.",
      ],
      pendingMinutes: 22,
    }),
    // Blank draftBody — the agent declined to draft. Seeded so the empty-state
    // render (placeholder copy, no send glyph) and the swipe-right local block
    // are both reachable in fixture mode without a backend. Newest of the four
    // so it sorts last and doesn't displace `[0]` in order-dependent tests.
    // (TAC-310.)
    draft({
      messageId: '44d7a2f4-5c6b-4d8e-9a0f-1c2d3e4f5a6b',
      venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      venueSlug: 'mock-sextant-coffee-roasters',
      guestId: 'dd44a2f4-5c6b-4d8e-9a0f-1c2d3e4f5a6b',
      guestDisplayName: 'Priya N.',
      guestPhoneFallback: '+15551110004',
      recognitionState: 'regular',
      agentReasoning:
        "Asking about a lost jacket — I don't have anything on lost property, so this needs your words, not mine.",
      recentContext: [
        {
          id: 'ee44a2f4-5c6b-4d8e-9a0f-1c2d3e4f5a6b',
          body: 'think i left a denim jacket on the back bench sunday — any chance?',
          direction: 'inbound',
          minsAgo: 3,
        },
      ],
      draftBody: '',
      category: null,
      voiceFidelity: null,
      reviewReason: 'Something went wrong writing this one.',
      reviewReasonCode: 'generation_failed',
      reviewTriggers: [],
      reviewTriggerLabels: [],
      pendingMinutes: 2,
    }),
  ];
}

// Heads-up cards (TAC-364). A comp arriving now, so the code chip and the "Now"
// arrival render offline, and a scheduled recommendation at the other venue,
// so a card with no chip and a clock time does too.
function seedCommitments(): HeadsUpCommitment[] {
  const now = Date.now();
  return [
    {
      id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
      venueId: FIXTURE_SEXTANT_ID,
      guestId: 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
      type: 'comp',
      guest: { name: 'Sam' },
      description: 'A cortado on the house, after the mix-up with Tuesday’s order',
      code: '7K2P',
      expected_arrival: null,
      created_at: new Date(now - 26 * 60 * 60_000).toISOString(),
      recognitionState: 'regular',
      sourceMessageId: '66f9c4b6-7e8d-4fa0-9c2b-3e4f5a6b7c8d',
    },
    {
      id: '77a0d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e',
      venueId: FIXTURE_CENTRAL_PERK_ID,
      guestId: 'ff77d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e',
      type: 'recommendation',
      guest: { name: 'Lena' },
      description: 'Try the rosemary loaf when it comes out at 4',
      code: null,
      expected_arrival: new Date(now + 3 * 60 * 60_000).toISOString(),
      created_at: new Date(now - 2 * 60 * 60_000).toISOString(),
      recognitionState: 'new',
      sourceMessageId: null,
    },
  ];
}

const queue: Map<string, PendingDraft> = new Map();
const commitments: Map<string, HeadsUpCommitment> = new Map();
const archive: Map<string, ArchiveEntry> = new Map();
const subscribers: Set<Subscriber> = new Set();

function reseed(): void {
  queue.clear();
  commitments.clear();
  archive.clear();
  for (const d of seedDrafts()) queue.set(d.messageId, d);
  for (const c of seedCommitments()) commitments.set(c.id, c);
}

reseed();

function emit(): void {
  subscribers.forEach((fn) => fn({ type: 'queue_changed' }));
}

export function subscribeQueueFixture(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function listQueueFixture(): PendingDraft[] {
  return Array.from(queue.values()).sort(
    (a, b) => b.pendingSinceMs - a.pendingSinceMs,
  );
}

export function listCommitmentsFixture(): HeadsUpCommitment[] {
  return Array.from(commitments.values()).sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  );
}

/** Mirrors `/acknowledge`: clears the card, sends nothing. 409 once it's gone. */
export function acknowledgeCommitmentFixture(commitmentId: string): Result<void> {
  if (!commitments.delete(commitmentId)) {
    return err<ApiError>({ kind: 'HTTP', status: 409, message: 'already_acknowledged' });
  }
  return ok(undefined);
}

/**
 * Mirrors `/draft-decline`: cancels the commitment and persists a PENDING
 * decline draft into the fixture queue (nothing is sent), returning
 * `{ messageId, body }`. 409 once the commitment is gone.
 */
export function declineCommitmentFixture(
  commitmentId: string,
): Result<DeclineCommitmentResult> {
  const commitment = commitments.get(commitmentId);
  if (!commitment) {
    return err<ApiError>({ kind: 'HTTP', status: 409, message: 'invalid_state' });
  }
  commitments.delete(commitmentId);
  const messageId = fixtureUuid();
  const body =
    "So sorry, we can't do that today after all. Can we make it up to you next time?";
  queue.set(
    messageId,
    draft({
      messageId,
      venueId: commitment.venueId,
      venueSlug:
        FIXTURE_VENUES.find((v) => v.id === commitment.venueId)?.slug ?? '',
      guestId: commitment.guestId,
      guestDisplayName: commitment.guest.name || null,
      guestPhoneFallback: '+15551110005',
      recognitionState: commitment.recognitionState,
      agentReasoning: null,
      recentContext: [],
      draftBody: body,
      category: null,
      voiceFidelity: null,
      reviewReason: "You passed on the last one, so here's another go.",
      reviewReasonCode: 'operator_decline_initiated',
      reviewTriggers: ['operator_decline_initiated'],
      reviewTriggerLabels: ["You passed on the last one, so here's another go."],
      pendingMinutes: 0,
    }),
  );
  emit();
  return ok({ messageId, body });
}

export function approveDraftFixture(messageId: string): Result<void> {
  const existing = queue.get(messageId);
  if (existing) {
    queue.delete(messageId);
    archive.set(messageId, { draft: existing, reason: 'approved' });
  }
  return ok(undefined);
}

export function skipDraftFixture(messageId: string): Result<void> {
  const existing = queue.get(messageId);
  if (existing) {
    queue.delete(messageId);
    archive.set(messageId, { draft: existing, reason: 'skipped' });
  }
  return ok(undefined);
}

export function editAndSendFixture(
  messageId: string,
  body: string,
): Result<void> {
  const existing = queue.get(messageId);
  if (existing) {
    queue.delete(messageId);
    archive.set(messageId, {
      draft: existing,
      reason: 'edited',
      edited_body: body,
    });
    return ok(undefined);
  }
  const archived = archive.get(messageId);
  if (archived && archived.reason === 'edited' && archived.edited_body !== body) {
    archive.set(messageId, { ...archived, edited_body: body });
  }
  return ok(undefined);
}

export function undoActionFixture(messageId: string): Result<void, ApiError> {
  const archived = archive.get(messageId);
  if (archived) {
    archive.delete(messageId);
    queue.set(messageId, archived.draft);
  }
  return ok(undefined);
}

/** Inserts a synthetic draft and broadcasts a queue_changed event. Used by
 * dev tooling / storybook to exercise the realtime path without a backend. */
export function triggerQueueAddedFixture(d: PendingDraft): void {
  queue.set(d.messageId, d);
  emit();
}

// Synthetic fuller thread for the edit screen in fixture mode. For drafts in
// the seed list we extend their `recentContext` with older messages so the
// thread view shows what a real conversation looks like; for unknown
// messageIds (e.g. mid-test inserts) we just return whatever `recentContext`
// the draft already carries. Empty array if neither resolves. (TAC-290.)
export function getThreadFixture(messageId: string): ThreadMessage[] {
  const seedExtensions: Record<string, ThreadMessage[]> = {
    // Maya R. — earlier history before the patio confirmation thread
    '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d': [
      {
        id: 'aa00d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'inbound',
        body: 'hey! is dinner walk-in friendly tonight?',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString(),
      },
      {
        id: 'aa01d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'outbound',
        body: 'walk-ins welcome — patio runs first-come on weekday nights.',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60_000 + 90_000).toISOString(),
      },
      {
        id: 'aa02d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'inbound',
        body: 'perfect, see you around 7',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60_000 + 4 * 60_000).toISOString(),
      },
    ],
    // Sam: the conversation behind the comp heads-up card (TAC-364).
    '66f9c4b6-7e8d-4fa0-9c2b-3e4f5a6b7c8d': [
      {
        id: 'aa05d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'inbound',
        body: 'hey, tuesday you gave me a latte instead of my cortado',
        createdAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
      },
      {
        id: 'aa06d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'outbound',
        body: "So sorry about that. Your next cortado is on us, just mention 7K2P.",
        createdAt: new Date(Date.now() - 26 * 60 * 60_000 + 90_000).toISOString(),
      },
      {
        id: 'aa07d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'inbound',
        body: 'omw now!',
        createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      },
    ],
    // Devon L. — earlier rosemary-loaf preamble
    '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a': [
      {
        id: 'aa03d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'inbound',
        body: 'the buckwheat cake last sunday was unreal',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString(),
      },
      {
        id: 'aa04d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        direction: 'outbound',
        body: 'so glad — we play with that recipe quarterly, this batch had the flax.',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60_000 + 2 * 60_000).toISOString(),
      },
    ],
  };

  const existing = queue.get(messageId);
  const baseRecent = existing?.recentContext ?? [];
  const recent: ThreadMessage[] = baseRecent.map((m) => ({
    id: m.id,
    direction: m.direction,
    body: m.body,
    createdAt: m.createdAt,
  }));
  const extension = seedExtensions[messageId] ?? [];
  // Both arrays are oldest-first; the extension comes before recent context.
  return [...extension, ...recent];
}

const threadSubscribers: Set<ThreadSubscriber> = new Set();

/**
 * No-op-by-default fixture-mode subscription for the open-thread Realtime
 * channel. Matches `createThreadChannel`'s shape so the channel doesn't crash
 * in fixture mode. We don't emit synthetic inbound bubbles here — fixture
 * mode is for offline UI dev, not for exercising Realtime; the queue fixture
 * subscriber path already emits `queue_changed` when triggered. (TAC-290.)
 */
export function subscribeThreadFixture(fn: ThreadSubscriber): () => void {
  threadSubscribers.add(fn);
  return () => {
    threadSubscribers.delete(fn);
  };
}

export function resetQueueFixture(): void {
  reseed();
}

// re-export so tests / dev tooling can construct fresh UUIDs against the same
// strict-Zod-friendly generator the seeds use.
export { fixtureUuid };
