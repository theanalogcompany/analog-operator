import {
  type PendingDraft,
  type RecognitionState,
  type ThreadMessage,
} from '@/lib/api/queue';
import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { type ApiError, type Result, ok } from '@/lib/api/errors';
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
  pendingMinutes: number;
}): PendingDraft => {
  const now = Date.now();
  return {
    messageId: args.messageId,
    venueId: args.venueId,
    venueSlug: args.venueSlug,
    guestId: args.guestId,
    guestDisplayName: args.guestDisplayName,
    guestPhoneFallback: args.guestPhoneFallback,
    draftBody: args.draftBody,
    category: args.category,
    voiceFidelity: args.voiceFidelity,
    reviewReason: args.reviewReason,
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
      reviewReason: 'low fidelity score',
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
      reviewReason: 'first message from new guest',
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
      reviewReason: null,
      pendingMinutes: 22,
    }),
  ];
}

const queue: Map<string, PendingDraft> = new Map();
const archive: Map<string, ArchiveEntry> = new Map();
const subscribers: Set<Subscriber> = new Set();

// Heads-up commitment fixtures (TAC-298). Same subscriber set as drafts —
// any change to either list emits a single `queue_changed` event, matching
// the realtime contract.
const commitments: Map<string, HeadsUpCommitment> = new Map();
// Synthetic draft store keyed by the messageId returned from
// `declineDraftFixture`. `editAndSendFixture`/`skipDraftFixture` already
// tolerate unknown messageIds (they no-op), so we don't need to inject the
// stub into the main `queue` map — but we do need to remember the mapping
// so the second swipe-left can return 409 (commitment already cancelled,
// see TAC-299 Decision 1: trigger-time cancel).
const cancelledCommitments: Set<string> = new Set();

function seedCommitments(): HeadsUpCommitment[] {
  return [
    {
      id: 'aabbccdd-1111-4222-8333-444455556666',
      type: 'comp',
      guestName: 'Maya',
      description: 'oat latte on the house',
      code: '7K2P',
      expectedArrival: new Date(Date.now() + 5 * 60_000).toISOString(),
      createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
      recognitionState: 'returning',
      sourceMessageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    },
    {
      id: 'eeff0011-2222-4333-8444-555566667777',
      type: 'recommendation',
      guestName: 'Devon',
      description: 'rosemary loaf ready around 7',
      code: null,
      expectedArrival: new Date(Date.now() + 60 * 60_000).toISOString(),
      createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      recognitionState: 'raving_fan',
      sourceMessageId: null,
    },
  ];
}

function reseed(): void {
  queue.clear();
  archive.clear();
  for (const d of seedDrafts()) queue.set(d.messageId, d);
  commitments.clear();
  cancelledCommitments.clear();
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

// Heads-up commitment fixture surface (TAC-298). Mirrors the draft fixture
// shape — same in-memory map pattern, same emit() on mutation.

export function listCommitmentsFixture(): HeadsUpCommitment[] {
  // Oldest-first — matches the server's FIFO ordering for the heads-up queue.
  return Array.from(commitments.values()).sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export function acknowledgeCommitmentFixture(commitmentId: string): Result<void> {
  commitments.delete(commitmentId);
  return ok(undefined);
}

/** Synthetic draft-decline: removes the commitment from the heads-up list
 * (server-side this is `cancelled` on trigger per TAC-299 Decision 1) and
 * returns a fresh fixture messageId. A second call on the same commitment
 * returns the cancelled-already shape (HTTP 409 in production), surfaced
 * here as a PARSE error so the screen path treats it like the live failure
 * mode. (TAC-298.) */
export function declineDraftFixture(
  commitmentId: string,
): Result<{ messageId: string }> {
  if (cancelledCommitments.has(commitmentId)) {
    return {
      ok: false,
      error: {
        kind: 'HTTP',
        status: 409,
        message: JSON.stringify({ error: 'invalid_state' }),
      },
    };
  }
  if (!commitments.has(commitmentId)) {
    return {
      ok: false,
      error: {
        kind: 'HTTP',
        status: 404,
        message: JSON.stringify({ error: 'not_found' }),
      },
    };
  }
  commitments.delete(commitmentId);
  cancelledCommitments.add(commitmentId);
  return ok({ messageId: fixtureUuid() });
}

/** Inserts a synthetic commitment and broadcasts a queue_changed event.
 * Used by dev tooling / storybook to exercise the realtime path. */
export function triggerCommitmentAddedFixture(c: HeadsUpCommitment): void {
  commitments.set(c.id, c);
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
