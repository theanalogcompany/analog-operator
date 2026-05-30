import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { type PendingDraft } from '@/lib/api/queue';

// The queue surfaces two distinct card types: draft-review cards (TAC-258 +
// TAC-37) and heads-up commitment cards (TAC-298). A single discriminated
// union lets `QueueCardStack` and `FrontCard` branch render + swipe-routing
// on `card.type` without forking the queue. (TAC-298.)
export type QueueCard =
  | { type: 'draft_review'; draft: PendingDraft }
  | { type: 'heads_up'; commitment: HeadsUpCommitment };

// FIFO across both lists by elapsed age. Drafts carry `pendingSinceMs`
// (server-computed elapsed ms since the draft was queued); commitments carry
// `createdAt` (ISO timestamp) so client-side `Date.now() - parse` normalizes
// the two scales. Older items surface first — the same FIFO discipline the
// pre-commitments queue used for drafts alone. (TAC-298.)
export function interleaveCards(
  drafts: PendingDraft[],
  commitments: HeadsUpCommitment[],
  now: number = Date.now(),
): QueueCard[] {
  type Aged = { card: QueueCard; ageMs: number };

  const draftCards: Aged[] = drafts.map((draft) => ({
    card: { type: 'draft_review', draft },
    ageMs: draft.pendingSinceMs,
  }));

  const commitmentCards: Aged[] = commitments.map((commitment) => {
    const createdMs = Date.parse(commitment.createdAt);
    // Defensive: unparseable createdAt sorts as freshest (least urgent),
    // matching the convention that drafts with `pendingSinceMs=0` sort last.
    const ageMs = Number.isFinite(createdMs) ? Math.max(0, now - createdMs) : 0;
    return { card: { type: 'heads_up', commitment }, ageMs };
  });

  return [...draftCards, ...commitmentCards]
    .sort((a, b) => b.ageMs - a.ageMs)
    .map((a) => a.card);
}

// Stable identity for React keys. Both id spaces are UUIDs, but they live in
// separate tables — prefix with the card type so a draft and commitment with
// (vanishingly unlikely) colliding ids never share a key.
export function cardKey(card: QueueCard): string {
  return card.type === 'draft_review'
    ? `draft:${card.draft.messageId}`
    : `headsup:${card.commitment.id}`;
}
