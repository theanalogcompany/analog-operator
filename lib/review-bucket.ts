/**
 * What kind of decision a queue card is: its bucket, which names the ground it
 * sits on, its strip colour and its strip label.
 *
 * Keyed on `reviewReasonCode`, the RAW trigger code, and never on the label
 * prose. The module this replaces, `queue-tone.ts`, joined on three English
 * strings the server has never emitted, so every production card fell to its
 * default and two of its three colours were never seen. A copy edit on the
 * server must not be able to recolour a card. (TAC-364.)
 */

import { type PendingDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { type CardGroundName, STRIP_COLORS } from '@/lib/grounds';
import { type QueueItem } from '@/lib/queue-items';

export type ReviewBucket = CardGroundName;

/** Every bucket a draft can be in. `headsUp` belongs to commitment cards. */
export type DraftBucket = Exclude<ReviewBucket, 'headsUp'>;

const REVIEW_BUCKETS: readonly ReviewBucket[] = [
  'obligation',
  'outsideDraft',
  'draftWrong',
  'midThread',
  'headsUp',
];

/**
 * Transcribed from TAC-364's design spec, "Reason code → bucket".
 *
 * This is a hand-kept mirror of a server enum (analog-guest's
 * `REVIEW_REASON_LABELS`), so a code added there reaches this app as unknown
 * and lands on `FALLBACK_BUCKET` until it is added here. That is the safe
 * direction: an unrecognised card sits on the mid-thread ground, never on a
 * flag colour.
 *
 * The ground follows the PRIMARY trigger only. The server's
 * `PRIMARY_TRIGGER_PRIORITY` already chose it; the other triggers are listed on
 * the card rather than competing for its colour.
 */
const BUCKET_BY_CODE: Readonly<Record<string, DraftBucket>> = {
  // 01 Obligation: yes or no on money.
  commitment_type_gated: 'obligation',
  comp_regex_backstop: 'obligation',
  complaint_commitment_floor: 'obligation',
  mechanic_offer_backstop: 'obligation',
  // 02 Something outside the draft needs you.
  knowledge_gap: 'outsideDraft',
  knowledge_gap_backstop: 'outsideDraft',
  grounding_check_failed: 'outsideDraft',
  hold_all_outbound: 'outsideDraft',
  category_requires_approval: 'outsideDraft',
  // 03 The draft came out wrong.
  model_flagged: 'draftWrong',
  self_talk_detected: 'draftWrong',
  fidelity_below_auto_send_floor: 'draftWrong',
  generation_failed: 'draftWrong',
  // 04 You're mid-thread with this guest.
  previous_pending_held: 'midThread',
  operator_decline_initiated: 'midThread',
};

/**
 * Where a code this app doesn't know goes: Honey, matching the server's
 * "Needs review" label fallback. Never a flag colour.
 */
export const FALLBACK_BUCKET: DraftBucket = 'midThread';

const STRIP_LABELS: Record<DraftBucket, string> = {
  obligation: CARD_COPY.strip.obligation,
  outsideDraft: CARD_COPY.strip.outsideDraft,
  draftWrong: CARD_COPY.strip.draftWrong,
  midThread: CARD_COPY.strip.midThread,
};

/**
 * `hasOwnProperty`, not a bare index: the map is a plain object, so a code
 * spelled like a prototype member (`toString`) would otherwise find a function.
 */
function knownBucket(code: string): DraftBucket | null {
  const key = code.trim();
  return Object.prototype.hasOwnProperty.call(BUCKET_BY_CODE, key)
    ? BUCKET_BY_CODE[key]
    : null;
}

/** For route params, which are untrusted strings. */
export function isReviewBucket(value: unknown): value is ReviewBucket {
  return (
    typeof value === 'string' &&
    (REVIEW_BUCKETS as readonly string[]).includes(value)
  );
}

export function bucketForDraft(
  draft: Pick<PendingDraft, 'reviewReasonCode'>,
): DraftBucket {
  return knownBucket(draft.reviewReasonCode) ?? FALLBACK_BUCKET;
}

export function bucketForItem(item: QueueItem): ReviewBucket {
  return item.kind === 'draft' ? bucketForDraft(item.draft) : 'headsUp';
}

export function stripColorFor(bucket: ReviewBucket): string {
  return STRIP_COLORS[bucket];
}

/**
 * The strip's caps label. An unrecognised code gets the mid-thread ground but
 * NOT the "Mid-thread" label, which would claim something about the card that
 * nobody knows. It reads "Needs review" instead, the same fallback the server
 * uses for the sentence.
 */
export function stripLabelForDraft(
  draft: Pick<PendingDraft, 'reviewReasonCode'>,
): string {
  const bucket = knownBucket(draft.reviewReasonCode);
  return bucket ? STRIP_LABELS[bucket] : CARD_COPY.strip.unrecognised;
}

/** analog-guest's label for a trigger code its own map doesn't know. */
const SERVER_FALLBACK_LABEL = 'Needs review';

/**
 * The other triggers that fired, as their display labels, in server order.
 *
 * The server sends the full set in `reviewTriggers`, primary INCLUDED and never
 * deduped, so the secondaries are that set minus `reviewReasonCode`: a
 * subtraction that only works because both sides are codes. Labels are paired
 * by index, since the Contract keeps the two arrays parallel. If their lengths
 * disagree the pairing can't be trusted, so nothing is shown rather than a label
 * next to the wrong trigger. A label is dropped when it repeats the primary's
 * sentence or an earlier label, or when it is the server's fallback for a code
 * it doesn't know: as a secondary that says nothing, and with no full stop it
 * would run straight into the next label.
 */
export function secondaryTriggerLabels(
  draft: Pick<
    PendingDraft,
    'reviewReason' | 'reviewReasonCode' | 'reviewTriggers' | 'reviewTriggerLabels'
  >,
): string[] {
  const { reviewTriggers: codes, reviewTriggerLabels: labels } = draft;
  if (codes.length !== labels.length) return [];
  const primaryCode = draft.reviewReasonCode.trim();
  const primarySentence = draft.reviewReason?.trim() ?? '';
  const out: string[] = [];
  codes.forEach((code, i) => {
    if (code.trim() === primaryCode) return;
    const label = labels[i].trim();
    if (
      label.length === 0 ||
      label === SERVER_FALLBACK_LABEL ||
      label === primarySentence ||
      out.includes(label)
    ) {
      return;
    }
    out.push(label);
  });
  return out;
}

/** `"01 / 04"`: the flag strip's right-hand progress counter. */
export function formatProgress(position: number, total: number): string {
  const pad = (n: number): string => String(Math.max(0, n)).padStart(2, '0');
  return `${pad(position)} / ${pad(total)}`;
}
