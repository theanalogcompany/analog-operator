/**
 * A guest's own little queue, when the deck holds more than one card for them.
 *
 * Since TAC-397 a guest's second message gets its OWN card rather than
 * overwriting the reply waiting for approval, so a guest can hold several
 * pending cards at once. Without a marker the second and third read as a
 * duplicate or a bug; "2 / 3 cards for Mia" makes them read as a set.
 *
 * **Derived from the deck, not from `otherPendingDraftsForGuest`.** The server
 * field is a count and this needs a POSITION as well, which a count cannot
 * give. Deriving both from the deck also means the row cannot disagree with
 * what is on screen: the deck is venue-filtered (TAC-382) and reflects
 * optimistic removals, so when one of a guest's cards is sent the rest
 * renumber immediately rather than waiting for a reload to agree with them.
 *
 * (TAC-486, C1.)
 */

import { type QueueItem } from '@/lib/queue-items';

export type SubQueuePosition = {
  /** 1-based, among this guest's cards in deck order. */
  position: number;
  total: number;
};

/**
 * Where this card sits among the guest's cards, or null when it is their only
 * one.
 *
 * Null rather than `{ position: 1, total: 1 }` on purpose: the row is not
 * shown for a single card, and returning a position for one would leave every
 * caller writing the same `total > 1` check. The hand-off is explicit that with
 * one card left the row disappears.
 *
 * Heads-up cards are never counted. A commitment is not a pending reply, and
 * "2 cards for Mia" that silently included an arrival card would be a count the
 * operator could not reconcile with what they can act on.
 */
export function subQueuePositionFor(
  items: readonly QueueItem[],
  item: QueueItem,
): SubQueuePosition | null {
  if (item.kind !== 'draft') return null;
  const guestId = item.draft.guestId;

  const siblings = items.filter(
    (candidate) => candidate.kind === 'draft' && candidate.draft.guestId === guestId,
  );
  if (siblings.length < 2) return null;

  const index = siblings.findIndex((candidate) => candidate.key === item.key);
  if (index < 0) return null;

  return { position: index + 1, total: siblings.length };
}

/**
 * "1 / 3 cards for Mia".
 *
 * Reads true at any count, including two, which is what TAC-402 asks for. The
 * name is the guest's first word, or their handle when they have no name, so
 * it never invents a first name for someone we only know by a handle.
 */
export function subQueueLabel(
  spot: SubQueuePosition,
  guestName: string,
): string {
  return `${spot.position} / ${spot.total} cards for ${guestName}`;
}
