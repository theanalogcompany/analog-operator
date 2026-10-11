import { type PendingDraft, type ThreadMessage } from '@/lib/api/queue';

/**
 * The conversation a queue card shows above its composer, for the cards whose
 * `recentContext` cannot show it. (TAC-583.)
 *
 * A card normally draws `recentContext`, the queue payload's last three
 * messages. That payload carries text only and leaves out every empty-bodied
 * message, so for a guest who sent a photo with no words it holds nothing of
 * what they sent: the card says "sent an attachment with no text" and points
 * at nothing. Attachments exist only on the thread endpoints (TAC-582's
 * Contract adds no field to the queue), so those cards read the thread.
 *
 * Only those cards. Fetching a thread for every card in the deck to learn that
 * most have no media would be a request per swipe for nothing.
 */

/** As many messages as `recentContext` holds, so both sources fill the card alike. */
export const CARD_EXCERPT_SIZE = 3;

/**
 * The reason codes the server gives a card raised by media rather than by
 * text. `media_only_inbound` is checked against production (2026-10-11: every
 * such card has an empty draft and names the message it answers).
 * `unsupported_inbound` is from TAC-582's rulings and `media_context` from
 * Jaipal's ruling of 2026-10-11; neither had occurred there yet.
 */
const MEDIA_REASON_CODES: readonly string[] = [
  'media_only_inbound',
  'unsupported_inbound',
  // The guest wrote after sending an attachment. The text is in
  // `recentContext`; the attachment it follows is not.
  'media_context',
];

/**
 * Whether a card's excerpt should come from the thread.
 *
 * Two signals, either is enough. The reason code is the server saying so. The
 * second does not depend on a code name staying put: a card answering a
 * message with no text is answering media by definition, whatever the card is
 * called.
 */
export function needsThreadExcerpt(
  draft: Pick<PendingDraft, 'reviewReasonCode' | 'reviewTriggers' | 'replyingTo'>,
): boolean {
  if (MEDIA_REASON_CODES.includes(draft.reviewReasonCode)) return true;
  if (draft.reviewTriggers.some((code) => MEDIA_REASON_CODES.includes(code))) {
    return true;
  }
  return draft.replyingTo !== null && draft.replyingTo.body.trim().length === 0;
}

/**
 * The messages the card draws: the tail of the fetched thread when there is
 * one, and `recentContext` until then and whenever the fetch fails or comes
 * back empty. So the card is never worse than it was before this existed.
 */
export function cardExcerpt(
  recentContext: readonly ThreadMessage[],
  thread: readonly ThreadMessage[],
): ThreadMessage[] {
  if (thread.length === 0) return [...recentContext];
  return thread.slice(-CARD_EXCERPT_SIZE);
}
