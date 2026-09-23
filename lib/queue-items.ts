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
 * Whether this card's reply window has shut.
 *
 * Passed in rather than computed here, because expiry depends on the current
 * time and this module is pure: a hidden clock inside the swipe decision could
 * not be tested without driving one, and the whole reason `swipeActionFor`
 * exists as a pure function is TAC-312, where the gesture layer had no
 * coverage and the one place the behaviour lived was the one place nothing
 * looked.
 *
 * Required, not optional. Every call site has to state what it knows about the
 * window, so a new one cannot silently default to "still open" and hand an
 * expired card a working swipe.
 */
export type SwipeContext = {
  /** True only for a DRAFT card whose Instagram reply window has closed. */
  expired: boolean;
};

/**
 * A heads-up card can always be acknowledged, so the gesture never refuses it.
 * A draft card refuses swipe-right while its body is blank (TAC-312), and an
 * expired card refuses it because nothing can be sent from analog any more.
 */
export function canCommitRightFor(
  item: QueueItem,
  context: SwipeContext,
): boolean {
  if (item.kind === 'headsUp') return true;
  if (context.expired) return false;
  return item.draft.draftBody.trim().length > 0;
}

export type SwipeAction =
  | { type: 'approve'; draft: PendingDraft }
  | { type: 'edit'; draft: PendingDraft }
  | { type: 'refuse-approve'; draft: PendingDraft }
  | { type: 'acknowledge'; commitment: HeadsUpCommitment }
  | { type: 'decline'; commitment: HeadsUpCommitment }
  /**
   * A gesture that reached a decision on a card whose window has shut. It has
   * no draft payload and nothing to dispatch: the only thing owed is the one
   * line explaining why, which is what ruling 3 of 2026-09-23 asks for when a
   * gesture is in flight as the card crosses.
   */
  | { type: 'blocked-expired' }
  | { type: 'none' };

/**
 * What a finished swipe does to this card.
 *
 * Two guards, not one. The heads-up branch has no path to `approve` or `edit`,
 * so a commitment card can never send a message (TAC-364). The expired branch
 * has no path to `approve` OR `edit`: once the window is shut the draft cannot
 * be sent from analog at all, so opening the composer would offer an edit that
 * ends in a send that cannot happen.
 *
 * In practice an expired card is rendered outside the `GestureDetector`
 * entirely, so no swipe starts on one. This is the second guard, for the case
 * the gesture layer cannot prevent: a card that expires WHILE a pan is already
 * in flight.
 *
 * It is NOT the only place a send is stopped, and the difference matters. This
 * guard stops an expired card being OPENED. A takeover opened while the window
 * was still open outlives it entirely, and a long edit outlasts the 5-minute
 * display margin easily, so `handleSend` in `app/queue/edit.tsx` re-checks the
 * window at press time. Without that second check the send goes out, the server
 * refuses it, and the operator gets a generic failure toast that says nothing
 * about the window. (TAC-486.)
 */
export function swipeActionFor(
  item: QueueItem,
  outcome: SwipeOutcome,
  context: SwipeContext,
): SwipeAction {
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
  if (context.expired) {
    // `return` is an ordinary short drag that committed to nothing, so it owes
    // no explanation even here.
    return outcome === 'return' ? { type: 'none' } : { type: 'blocked-expired' };
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
