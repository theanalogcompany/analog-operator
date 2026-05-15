import {
  type PendingDraft,
  type RecognitionState,
} from '@/lib/api/queue';
import { type ApiError, type Result, ok } from '@/lib/api/errors';
// import type only — avoids a circular import with the realtime channel,
// which imports subscribeQueueFixture from this file.
import type { QueueChannelEvent } from '@/lib/realtime/queue-channel';

type Subscriber = (event: QueueChannelEvent) => void;

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

function reseed(): void {
  queue.clear();
  archive.clear();
  for (const d of seedDrafts()) queue.set(d.messageId, d);
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

export function resetQueueFixture(): void {
  reseed();
}

// re-export so tests / dev tooling can construct fresh UUIDs against the same
// strict-Zod-friendly generator the seeds use.
export { fixtureUuid };
