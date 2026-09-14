/**
 * What a heads-up card says. Pure, so the copy can be tested without mounting
 * the card. (TAC-364, carrying TAC-298.)
 *
 * Every string built here reaches the card, and card copy carries no em dashes:
 * it is read fast on a phone mid-shift, and an em dash is a pause the reader has
 * to parse. (TAC-364 acceptance criterion.)
 */

import { type HeadsUpCommitment } from '@/lib/api/queue';

/**
 * Types whose commitment carries a verification code the guest reads out at the
 * counter. The chip verifies nothing, but it is how the operator matches the
 * person in front of them to the promise. `recommendation` never has a code.
 * `discount` is here because the server issues it a code for the same reason it
 * issues one to a comp or a hold.
 */
const CODE_CHIP_TYPES: ReadonlySet<string> = new Set(['comp', 'hold', 'discount']);

const TYPE_LABELS: Readonly<Record<string, string>> = {
  comp: 'Comp',
  hold: 'Hold',
  discount: 'Discount',
  recommendation: 'Recommendation',
};

export function showsCodeChip(commitment: HeadsUpCommitment): boolean {
  const code = commitment.code?.trim() ?? '';
  return CODE_CHIP_TYPES.has(commitment.type) && code.length > 0;
}

/** An unrecognized type still renders, under a neutral label. */
export function commitmentTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? 'Commitment';
}

/** The server sends the guest's first name, or `''` when it has none. */
export function headsUpGuestName(commitment: HeadsUpCommitment): string {
  const name = commitment.guest.name.trim();
  return name.length > 0 ? name : 'Guest';
}

/** Intl renders a narrow no-break space before AM/PM; the card wants a space. */
function clock(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
    .format(ms)
    .replace(/[\u00a0\u202f]/g, ' ');
}

function calendarDay(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(ms);
}

/**
 * When the guest is due. "Now" once the expected time has arrived, or when the
 * guest gave none (an imminent arrival carries no time). Otherwise the clock
 * time, with the weekday when it is not today.
 */
export function arrivalLabel(
  expectedArrival: string | null,
  now: Date,
  timezone: string,
): string {
  if (!expectedArrival) return 'Now';
  const at = Date.parse(expectedArrival);
  if (Number.isNaN(at) || at <= now.getTime()) return 'Now';
  const time = clock(at, timezone);
  if (calendarDay(at, timezone) === calendarDay(now.getTime(), timezone)) return time;
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  }).format(at);
  return `${weekday} ${time}`;
}

/** The flag strip: the card's kind in caps, then when it is due. */
export function headsUpStripLabel(
  commitment: HeadsUpCommitment,
  now: Date,
  timezone: string,
): string {
  const arrival = arrivalLabel(commitment.expected_arrival, now, timezone);
  return arrival === 'Now' ? 'Commitment · Due now' : `Commitment · Due ${arrival}`;
}

/** How long ago the promise was made, for the head's elapsed label. */
export function commitmentAgeMs(commitment: HeadsUpCommitment, now: Date): number {
  const created = commitment.created_at ? Date.parse(commitment.created_at) : NaN;
  return Number.isNaN(created) ? 0 : Math.max(0, now.getTime() - created);
}
