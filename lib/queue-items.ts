/**
 * One card on the deck, and what a swipe on it does.
 *
 * The queue holds two kinds of card that share one chassis and must never be
 * confused for each other. A DRAFT card sends a message to a guest on
 * swipe-right. A HEADS-UP card is a commitment arriving (a guest the agent
 * promised something to is on their way) and nothing sends from it in either
 * direction: right acknowledges, left starts a decline draft that the operator
 * then reviews on the existing edit screen. (TAC-364, carrying TAC-298.)
 *
 * Because both kinds ride the same gesture, a heads-up swipe routed like a
 * draft swipe would reach `approveDraft` and send a real message to a guest.
 * That is why the decision lives here, as a pure function over a discriminated
 * union, rather than as an `if` inside a handler: `swipeActionFor` can only
 * produce `approve` from a `draft` item, and the compiler holds every consumer
 * to that shape.
 */

import { type SwipeOutcome } from '@/hooks/use-queue-swipe';
import { type HeadsUpCommitment, type PendingDraft } from '@/lib/api/queue';
import { type TapTarget } from '@/lib/notifications/tap-handler';

export type QueueItem =
  | { kind: 'draft'; key: string; draft: PendingDraft }
  | { kind: 'headsUp'; key: string; commitment: HeadsUpCommitment };

/**
 * A draft keeps its bare `messageId` as its key, so session progress and the
 * undo record (both keyed on message id since before heads-up cards existed)
 * keep working unchanged. A commitment id is prefixed so the two id spaces can
 * never collide in one list.
 */
export function draftItem(draft: PendingDraft): QueueItem {
  return { kind: 'draft', key: draft.messageId, draft };
}

export function headsUpItemKey(commitmentId: string): string {
  return `commitment:${commitmentId}`;
}

export function headsUpItem(commitment: HeadsUpCommitment): QueueItem {
  return { kind: 'headsUp', key: headsUpItemKey(commitment.id), commitment };
}

/**
 * Heads-up cards lead the deck. A `pending_ack` commitment means the guest has
 * said they are on their way (or it is the morning of a scheduled arrival), so
 * it is the one card whose moment passes on its own. Drafts keep the order
 * `useQueue` already gave them.
 */
export function buildQueueItems(
  drafts: readonly PendingDraft[],
  commitments: readonly HeadsUpCommitment[],
): QueueItem[] {
  return [...commitments.map(headsUpItem), ...drafts.map(draftItem)];
}

/**
 * Whether a card is the one a notification tap refers to. A commitment push
 * names its commitment, and a draft push names its draft by `draftId`. Only a
 * push that carries no `draftId` falls back to the guest, which lifts whichever
 * of their drafts the deck puts first (`sortByPriority` in hooks/use-queue.ts:
 * strongest recognition first, then oldest).
 *
 * A `draftId` that matches no card never falls back to the guest. Since TAC-394
 * a guest can hold two pending drafts, and that fallback is exactly how a tap
 * would open the other one. (TAC-403.)
 */
export function matchesTapTarget(item: QueueItem, target: TapTarget): boolean {
  if (target.kind === 'commitment') {
    return item.kind === 'headsUp' && item.commitment.id === target.commitmentId;
  }
  if (item.kind !== 'draft') return false;
  return target.draftId
    ? item.draft.messageId === target.draftId
    : item.draft.guestId === target.guestId;
}

/**
 * Lift the card a notification tap refers to onto the top of the deck, by
 * `matchesTapTarget`. When the card is not in the list (handled on another
 * device, or not loaded yet) the deck keeps its natural order.
 */
export function surfaceTappedItem(
  items: readonly QueueItem[],
  target: TapTarget | null,
): QueueItem[] {
  if (!target) return [...items];
  const idx = items.findIndex((item) => matchesTapTarget(item, target));
  if (idx <= 0) return [...items];
  return [items[idx], ...items.slice(0, idx), ...items.slice(idx + 1)];
}

/**
 * A heads-up card can always be acknowledged, so the gesture never refuses it.
 * A draft card refuses swipe-right while its body is blank (TAC-312).
 */
export function canCommitRightFor(item: QueueItem): boolean {
  if (item.kind === 'headsUp') return true;
  return item.draft.draftBody.trim().length > 0;
}

export type SwipeAction =
  | { type: 'approve'; draft: PendingDraft }
  | { type: 'edit'; draft: PendingDraft }
  | { type: 'refuse-approve'; draft: PendingDraft }
  | { type: 'acknowledge'; commitment: HeadsUpCommitment }
  | { type: 'decline'; commitment: HeadsUpCommitment }
  | { type: 'none' };

/**
 * What a finished swipe does to this card. The no-send guard is the heads-up
 * branch: it has no path to `approve` or `edit`, and a refusal (which the
 * gesture should never produce for a heads-up card) resolves to `none` rather
 * than to anything with a side effect.
 */
export function swipeActionFor(item: QueueItem, outcome: SwipeOutcome): SwipeAction {
  if (item.kind === 'headsUp') {
    switch (outcome) {
      case 'right':
        return { type: 'acknowledge', commitment: item.commitment };
      case 'left':
        return { type: 'decline', commitment: item.commitment };
      case 'refuse-right':
      case 'return':
        return { type: 'none' };
    }
  }
  switch (outcome) {
    case 'right':
      return { type: 'approve', draft: item.draft };
    case 'left':
      return { type: 'edit', draft: item.draft };
    case 'refuse-right':
      return { type: 'refuse-approve', draft: item.draft };
    case 'return':
      return { type: 'none' };
  }
}
