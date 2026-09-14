/**
 * Tone derivation for a queue card.
 *
 * The design gives each card a `tone` that picks both the flag-strip color and
 * the screen's ground. `PendingDraft` has no such field — the design's `tone`
 * came from the prototype's hand-authored seed data, not from this app's API.
 * Rather than make it a cross-repo Contract change (a ticket pair, a
 * server-first rollout, a tolerant-Zod window) it is derived here from what the
 * payload actually carries: `reviewReason`, falling back to `category`.
 *
 * This is the ONLY place that derivation lives. Screens name a tone; they never
 * inspect `reviewReason` themselves.
 *
 * Follow-up: `tone` (or a stable `reviewReasonCode`) belongs in the queue
 * payload. The map below is keyed on human-readable English prose, which is a
 * fragile join — a server-side copy edit silently reclassifies a card to the
 * default. Until then, unknown reasons fail safe to `stone` rather than
 * throwing or guessing.
 */

import { type PendingDraft } from '@/lib/api/queue';
import { type GroundName } from '@/lib/grounds';

export type QueueTone = 'clay' | 'stone' | 'ink';

/**
 * A heads-up card has no review reason to derive a tone from, so it names one.
 * Stone for now: the ground colour system (TAC-364's third PR) gives heads-up
 * cards their own ground, Bay, and replaces this.
 */
export const HEADS_UP_TONE: QueueTone = 'stone';

/**
 * Flag-strip fills. Deliberately NOT the `clay` / `inbound` / `ink` tailwind
 * tokens: the strip's clay is `clay-deep` (#A85638), not `clay` (#C66A4A).
 */
const STRIP_COLORS: Record<QueueTone, string> = {
  clay: '#A85638',
  stone: '#3A3530',
  ink: '#1C1814',
};

const GROUND_BY_TONE: Record<QueueTone, GroundName> = {
  clay: 'queueClay',
  stone: 'queueStone',
  ink: 'queueInk',
};

/** Matched case-insensitively against a trimmed `reviewReason`. */
const TONE_BY_REASON: Record<string, QueueTone> = {
  'no draft generated': 'ink',
  'first message from new guest': 'stone',
  'low fidelity score': 'clay',
};

/** Categories that read as clay when there is no review reason at all. */
const CLAY_CATEGORIES: ReadonlySet<string> = new Set(['reservation']);

function normalize(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function toneFor(draft: PendingDraft): QueueTone {
  const reason = normalize(draft.reviewReason);
  if (reason) return TONE_BY_REASON[reason] ?? 'stone';
  const category = normalize(draft.category);
  if (category && CLAY_CATEGORIES.has(category)) return 'clay';
  return 'stone';
}

export function stripColorFor(tone: QueueTone): string {
  return STRIP_COLORS[tone];
}

export function groundForTone(tone: QueueTone): GroundName {
  return GROUND_BY_TONE[tone];
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * The flag strip's left-hand label.
 *
 * A review reason is prefixed "Flagged — " because that is how the design reads
 * it; a card with no reason takes its category instead ("Reservation"), which
 * is a statement about the conversation rather than a flag. The prefix is
 * skipped when the server already sent one, so a future server-side wording
 * change can't produce "Flagged — Flagged — …".
 *
 * Rendered through `<TrackedCaps>`, which uppercases — so the casing here only
 * matters for screen readers and for any future non-caps surface.
 */
export function reasonLabelFor(draft: PendingDraft): string {
  const reason = draft.reviewReason?.trim();
  if (reason) {
    return /^flagged\b/i.test(reason) ? reason : `Flagged — ${reason}`;
  }
  const category = draft.category?.trim();
  if (category) return titleCase(category);
  return 'Needs review';
}

/** `"01 / 04"` — the flag strip's right-hand progress counter. */
export function formatProgress(position: number, total: number): string {
  const pad = (n: number): string => String(Math.max(0, n)).padStart(2, '0');
  return `${pad(position)} / ${pad(total)}`;
}
