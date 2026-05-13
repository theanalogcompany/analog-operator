import {
  type Message,
  type PendingDraft,
  type RecognitionBand,
} from '@/lib/api/queue';
import { type ApiError, type Result, ok } from '@/lib/api/errors';

export type QueueChannelEvent =
  | { type: 'queue_added'; draft: PendingDraft }
  | { type: 'guest_message'; message_id: string; inbound: Message }
  | {
      type: 'draft_regenerated';
      message_id: string;
      agent_draft: string;
      agent_reasoning: string | null;
    };

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

const draft = (
  args: {
    id: string;
    guest_id: string;
    guest_name: string | null;
    guest_phone: string;
    band: RecognitionBand;
    signals: string[];
    context: { id: string; body: string; direction: 'inbound' | 'outbound'; minsAgo: number }[];
    inbound_body: string;
    agent_draft: string;
    agent_reasoning: string | null;
    flag_reason: string | null;
    pending_minutes: number;
  },
): PendingDraft => {
  const now = Date.now();
  const inboundCreated = new Date(now - args.pending_minutes * 60_000).toISOString();
  return {
    id: args.id,
    guest_id: args.guest_id,
    guest_name: args.guest_name,
    guest_phone: args.guest_phone,
    recognition_band: args.band,
    recognition_signals: args.signals,
    context_messages: args.context.map((m) => ({
      id: m.id,
      body: m.body,
      direction: m.direction,
      created_at: new Date(now - m.minsAgo * 60_000).toISOString(),
    })),
    current_inbound: {
      id: args.id,
      body: args.inbound_body,
      direction: 'inbound',
      created_at: inboundCreated,
    },
    agent_draft: args.agent_draft,
    agent_reasoning: args.agent_reasoning,
    flag_reason: args.flag_reason,
    pending_since: inboundCreated,
    created_at: inboundCreated,
  };
};

function seedDrafts(): PendingDraft[] {
  return [
    draft({
      id: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guest_id: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guest_name: 'Maya R.',
      guest_phone: '+15551110001',
      band: 'returning',
      signals: ['7 visits over 4 months', 'last visit 2 weeks ago'],
      context: [
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
      ],
      inbound_body: "Yes please! Two of us at 7:30 if you can swing it.",
      agent_draft:
        "Done — got you down for two at 7:30. The corner spot by the olive tree. See you tonight.",
      agent_reasoning: 'Returning guest, casual register, confirm + add a small specific.',
      flag_reason: 'low fidelity score',
      pending_minutes: 4,
    }),
    draft({
      id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
      guest_id: 'bb22e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
      guest_name: null,
      guest_phone: '+15551110002',
      band: 'guest',
      signals: ['first message'],
      context: [],
      inbound_body: 'do you guys do gluten free pasta',
      agent_draft:
        "We do — we keep a gluten-free penne behind the bar and run it through clean water. Just let your server know.",
      agent_reasoning: 'New guest, simple yes-with-detail; mirror their lowercase register lightly.',
      flag_reason: 'first message from new guest',
      pending_minutes: 11,
    }),
    draft({
      id: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
      guest_id: 'cc33f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
      guest_name: 'Devon L.',
      guest_phone: '+15551110003',
      band: 'raving-fan',
      signals: ['23 visits this year', 'left a note about the bread last month', 'birthday tomorrow'],
      context: [
        {
          id: 'dd33f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
          body: 'Bringing my parents tomorrow — they\'re only in town one night.',
          direction: 'inbound',
          minsAgo: 38,
        },
      ],
      inbound_body: "Any chance you have the rosemary loaf coming out around 7?",
      agent_draft:
        "We'll time a loaf for 7 — and there'll be a slice of the buckwheat cake for the table on us, since tomorrow's the day. Looking forward to meeting them.",
      agent_reasoning:
        'Raving fan, birthday context known, lean into the relational warmth without overdoing it.',
      flag_reason: null,
      pending_minutes: 22,
    }),
  ];
}

const queue: Map<string, PendingDraft> = new Map();
const archive: Map<string, ArchiveEntry> = new Map();
const subscribers: Set<Subscriber> = new Set();

function reseed(): void {
  queue.clear();
  archive.clear();
  for (const d of seedDrafts()) queue.set(d.id, d);
}

reseed();

function emit(event: QueueChannelEvent): void {
  subscribers.forEach((fn) => fn(event));
}

export function subscribeQueueFixture(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function listQueueFixture(): PendingDraft[] {
  return Array.from(queue.values()).sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
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

export function triggerQueueAddedFixture(d: PendingDraft): void {
  queue.set(d.id, d);
  emit({ type: 'queue_added', draft: d });
}

export function triggerGuestMessageFixture(
  messageId: string,
  body: string,
): void {
  const existing = queue.get(messageId);
  if (!existing) return;
  const newMsg: Message = {
    id: fixtureUuid(),
    body,
    direction: 'inbound',
    created_at: new Date().toISOString(),
  };
  queue.set(messageId, {
    ...existing,
    context_messages: [...existing.context_messages, existing.current_inbound],
    current_inbound: newMsg,
  });
  emit({ type: 'guest_message', message_id: messageId, inbound: newMsg });
}

export function triggerDraftRegeneratedFixture(
  messageId: string,
  agentDraft: string,
  agentReasoning: string | null,
): void {
  const existing = queue.get(messageId);
  if (!existing) return;
  queue.set(messageId, { ...existing, agent_draft: agentDraft, agent_reasoning: agentReasoning });
  emit({
    type: 'draft_regenerated',
    message_id: messageId,
    agent_draft: agentDraft,
    agent_reasoning: agentReasoning,
  });
}

export function resetQueueFixture(): void {
  reseed();
}
