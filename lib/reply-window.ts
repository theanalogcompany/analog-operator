/**
 * Instagram's 24-hour reply window, as one pure function.
 *
 * The server (TAC-473's Contract) sends `replyWindowExpiresAt`: the guest's most
 * recent Instagram inbound `provider_sent_at` plus 24 hours, as Meta measures
 * it, with NO margin subtracted. The Contract is explicit that the client
 * applies its own display margin, because the server's own send gate already
 * refuses inside `INSTAGRAM_WINDOW_MARGIN_MS` (5 minutes) — so a client that
 * rendered the raw deadline would show about five minutes in which this server
 * would already decline to send, and the operator would swipe into a failure.
 *
 * Everything here keys on the deadline the server sent, never on an inbound
 * timestamp of our own. `created_at` is when our webhook received the event and
 * has been measured 1.8s and 2.3s away from Meta's own clock in production,
 * more on a redelivery. Only one clock decides this, and it is Meta's.
 *
 * `'none'` and `'unknown'` are deliberately separate, per the Contract:
 * a text guest HAS no window, while an Instagram guest with a null deadline has
 * one nobody has measured (no saved inbound carrying a Meta timestamp). They
 * render the same today, but the second must never render as expired — that
 * would tell the operator a reachable guest is out of reach. (TAC-486.)
 */

import { type GuestChannel } from '@/lib/api/queue';

/** Instagram's window. Not configurable: it is Meta's number, not ours. */
export const WINDOW_HOURS = 24;

/** Under this, the pill gains a border and starts showing minutes. */
export const CLOSE_HOURS = 6;

/** Under this, the pill fills clay and the label carries the word "Urgent". */
export const URGENT_MINS = 60;

/**
 * Subtracted from the server's deadline before anything is displayed, so the
 * bar reaches zero before Instagram does. Matches the server's own
 * `INSTAGRAM_WINDOW_MARGIN_MS`; if that changes, this changes with it.
 */
export const DISPLAY_MARGIN_MS = 5 * 60_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const WINDOW_MS = WINDOW_HOURS * HOUR_MS;
const CLOSE_MS = CLOSE_HOURS * HOUR_MS;
const URGENT_MS = URGENT_MINS * MINUTE_MS;

/**
 * What a card's reply window is doing.
 *
 * A union rather than a kind plus nullable fields, so a surface that reads
 * `remainingMs` cannot compile against a state that has none.
 */
export type ReplyWindowState =
  /** Not an Instagram conversation. There is no window and no timer. */
  | { readonly kind: 'none' }
  /** Instagram, but no deadline was recorded. NOT expired: do not say closed. */
  | { readonly kind: 'unknown' }
  | {
      readonly kind: 'plenty' | 'close' | 'urgent';
      /** Margin-adjusted, always > 0 here. */
      readonly remainingMs: number;
      /** 0..1 of the full 24h window, for the drain bar. */
      readonly fill: number;
      readonly label: string;
    }
  | {
      readonly kind: 'closed';
      /** How long ago the margin-adjusted window shut. Never negative. */
      readonly closedForMs: number;
      readonly label: string;
    };

/** A window that draws a bar and a pill: every state but `none` and `unknown`. */
export type DrawnWindowState = Extract<ReplyWindowState, { label: string }>;

/** A window that has shut. */
export type ClosedWindowState = Extract<ReplyWindowState, { kind: 'closed' }>;

/**
 * Both of these are type GUARDS rather than plain booleans, so a surface that
 * has asked the question cannot then read `label` or `closedForMs` off a state
 * that has neither. That is the whole reason to call them instead of inlining
 * `kind === 'none' || kind === 'unknown'`: the inline form narrows nothing, so
 * every consumer ends up re-proving the same thing to the compiler.
 */
export function isExpired(state: ReplyWindowState): state is ClosedWindowState {
  return state.kind === 'closed';
}

/** Whether this card shows the reply-window bar and pill at all. */
export function hasWindow(state: ReplyWindowState): state is DrawnWindowState {
  return state.kind !== 'none' && state.kind !== 'unknown';
}

/**
 * Round DOWN, always. A card that reads "1h left" while holding 59 minutes has
 * lied in the direction that costs a send.
 */
function floorDiv(ms: number, unit: number): number {
  return Math.floor(ms / unit);
}

/** "18h left" — hours only, the quiet end. */
function plentyLabel(remainingMs: number): string {
  return `${floorDiv(remainingMs, HOUR_MS)}h left`;
}

/**
 * "4h 20m left" — minutes appear. At an exact hour the "0m" is dropped: the
 * border, not the word, is what marks this state, and "6h 0m left" reads as a
 * bug rather than as precision.
 */
function closeLabel(remainingMs: number): string {
  const hours = floorDiv(remainingMs, HOUR_MS);
  const minutes = floorDiv(remainingMs - hours * HOUR_MS, MINUTE_MS);
  return minutes === 0 ? `${hours}h left` : `${hours}h ${minutes}m left`;
}

/**
 * "Urgent · 42m left" — minutes only, and the word.
 *
 * The word is the point: it carries the state for an operator who cannot use
 * the clay fill, so this state never depends on colour alone. A middle dot, not
 * an em dash (TAC-364).
 */
function urgentLabel(remainingMs: number): string {
  return `Urgent · ${floorDiv(remainingMs, MINUTE_MS)}m left`;
}

/** "Closed 3h ago" — counts up, not down. */
function closedLabel(closedForMs: number): string {
  if (closedForMs < MINUTE_MS) return 'Just closed';
  if (closedForMs < HOUR_MS) return `Closed ${floorDiv(closedForMs, MINUTE_MS)}m ago`;
  if (closedForMs < DAY_MS) return `Closed ${floorDiv(closedForMs, HOUR_MS)}h ago`;
  return `Closed ${floorDiv(closedForMs, DAY_MS)}d ago`;
}

/**
 * "3 hours ago", for the expired card's body line.
 *
 * A separate register from the pill's "Closed 3h ago" on purpose. The pill is
 * a chip read at a glance and clips its units; this sits in a sentence the
 * operator reads ("Instagram stopped accepting replies 3 hours ago"), where
 * "3h" would read as shorthand dropped into prose.
 *
 * Rounds down like everything else here, so the sentence never overstates how
 * long the window has been shut.
 */
export function closedAgoPhrase(closedForMs: number): string {
  if (closedForMs < MINUTE_MS) return 'a moment ago';
  if (closedForMs < HOUR_MS) {
    const minutes = floorDiv(closedForMs, MINUTE_MS);
    return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`;
  }
  if (closedForMs < DAY_MS) {
    const hours = floorDiv(closedForMs, HOUR_MS);
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }
  const days = floorDiv(closedForMs, DAY_MS);
  return days === 1 ? 'a day ago' : `${days} days ago`;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The card's window state, from the server's deadline and the current time.
 *
 * `expiresAt` is `replyWindowExpiresAt` verbatim off the wire. An unparseable
 * value resolves to `'unknown'`, never to `'closed'`: failing toward "we do not
 * know" cannot tell an operator a reachable guest is out of reach, and the
 * opposite can.
 */
export function windowState(args: {
  expiresAt: string | null;
  channel: GuestChannel;
  nowMs: number;
}): ReplyWindowState {
  const { expiresAt, channel, nowMs } = args;

  if (channel !== 'instagram') return { kind: 'none' };
  if (expiresAt === null) return { kind: 'unknown' };

  const deadlineMs = Date.parse(expiresAt);
  if (Number.isNaN(deadlineMs)) return { kind: 'unknown' };

  const remainingMs = deadlineMs - DISPLAY_MARGIN_MS - nowMs;

  if (remainingMs <= 0) {
    const closedForMs = -remainingMs;
    return { kind: 'closed', closedForMs, label: closedLabel(closedForMs) };
  }

  const fill = clamp01(remainingMs / WINDOW_MS);

  if (remainingMs < URGENT_MS) {
    return { kind: 'urgent', remainingMs, fill, label: urgentLabel(remainingMs) };
  }
  if (remainingMs <= CLOSE_MS) {
    return { kind: 'close', remainingMs, fill, label: closeLabel(remainingMs) };
  }
  return { kind: 'plenty', remainingMs, fill, label: plentyLabel(remainingMs) };
}
