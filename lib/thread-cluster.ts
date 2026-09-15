import type { ThreadMessage } from '@/lib/api/queue';
import { thread } from '@/lib/theme';

// Where a bubble sits in its same-direction chain. 'only' = a single bubble
// (no neighbors on either side or one of them is across the direction
// boundary). 'first' = top of a 2+ chain, 'middle' = inside a 3+ chain,
// 'last' = bottom of a 2+ chain. The tail-corner radius lives on 'only' and
// 'last'; 'first' and 'middle' get full bottom corners.
export type BubblePosition = 'only' | 'first' | 'middle' | 'last';

export type ThreadItem =
  | { kind: 'timestamp'; key: string; label: string }
  | {
      kind: 'bubble';
      key: string;
      message: ThreadMessage;
      position: BubblePosition;
    };

/**
 * Formats an instant as its calendar day in the given IANA zone. `en-CA`
 * yields "YYYY-MM-DD", so two instants fall on the same day exactly when
 * their formatted values are equal — no date arithmetic, and no assumption
 * that a day is 24 hours (it isn't, across a DST change).
 *
 * The formatter is built by the caller and reused: `computeItems` asks the day
 * of every message in the thread, which runs to the server's cap of 200 rows
 * (analog-guest's thread endpoint, per TAC-395's Contract), and constructing an
 * `Intl.DateTimeFormat` per message is slow on Hermes.
 */
function dayKeyFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function ms(iso: string): number {
  return Date.parse(iso);
}

/**
 * Groups a chronological message array (oldest → newest, ASC by createdAt)
 * into rendered items: a day separator at each calendar-day boundary, and
 * bubbles annotated with their position in the same-direction chain.
 * Sequence chains break when direction flips or when consecutive
 * same-direction messages are >60s apart.
 *
 * Separators mark days, not gaps. A quiet hour inside one day gets no
 * separator, and no two separators are ever adjacent, because a bubble
 * always follows the one that introduced its day. The day is the one the
 * message falls on in `timezone`, which is not the same as the device's or
 * UTC's — a late-evening Pacific message is already tomorrow in UTC.
 *
 * `nowMs` is threaded through to the label so "Today" is deterministic in
 * tests; it defaults to the wall clock, which is what both screens use.
 *
 * Assumes input is already sorted ASC. Returns [] for empty input.
 */
export function computeItems(
  messages: ThreadMessage[],
  timezone: string,
  nowMs: number = Date.now(),
): ThreadItem[] {
  if (messages.length === 0) return [];

  // Pass 1: bubble positions. Same direction AND within sequenceGapMs of the
  // previous message → chained; otherwise breaks the chain.
  const linkedWithPrev: boolean[] = new Array(messages.length).fill(false);
  for (let i = 1; i < messages.length; i++) {
    const cur = messages[i];
    const prev = messages[i - 1];
    const sameDir = cur.direction === prev.direction;
    const closeInTime = ms(cur.createdAt) - ms(prev.createdAt) <= thread.sequenceGapMs;
    linkedWithPrev[i] = sameDir && closeInTime;
  }
  const positions: BubblePosition[] = messages.map((_, i) => {
    const hasPrev = i > 0 && linkedWithPrev[i];
    const hasNext = i < messages.length - 1 && linkedWithPrev[i + 1];
    if (!hasPrev && !hasNext) return 'only';
    if (!hasPrev && hasNext) return 'first';
    if (hasPrev && hasNext) return 'middle';
    return 'last';
  });

  // Pass 2: a separator above the first message of each calendar day.
  const dayKey = dayKeyFormatter(timezone);
  const items: ThreadItem[] = [];
  let previousDay: string | null = null;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const day = dayKey.format(new Date(msg.createdAt));
    if (day !== previousDay) {
      items.push({
        kind: 'timestamp',
        key: `ts-${msg.id}`,
        label: dayDividerLabel(msg.createdAt, timezone, nowMs, dayKey),
      });
      previousDay = day;
    }
    items.push({
      kind: 'bubble',
      key: `b-${msg.id}`,
      message: msg,
      position: positions[i],
    });
  }
  return items;
}

/**
 * The separator's text: `"Today · 7:14 PM"`, `"Yesterday · 7:14 PM"`, or
 * `"Wed Sep 9 · 7:14 PM"` for anything older.
 *
 * One shape for every surface — the queue card, the heads-up card, the edit
 * takeover and the Conversations thread all read this. It names a relative
 * day and an exact clock time because the operator is deciding whether a
 * four-minute-old question is still warm. No time-of-day words: a 9:39 AM
 * message read "night" under the format this replaced. (TAC-408.)
 *
 * An older day carries no year, so on the Conversations thread — the one
 * surface that shows a guest's whole history — the same date in two different
 * years reads identically. Recorded rather than fixed: a year is a change to
 * the ruled label shape.
 *
 * Every caller supplies the zone. The edit screen and the Conversations
 * thread pass the venue's; the two cards still pass the device's, which
 * TAC-414 is filed to fix.
 */
function dayDividerLabel(
  iso: string,
  timezone: string,
  nowMs: number,
  dayKey: Intl.DateTimeFormat,
): string {
  const date = new Date(iso);
  const key = dayKey.format(date);
  const todayKey = dayKey.format(new Date(nowMs));
  // Yesterday is today's calendar date minus one day, decremented on the date
  // itself and never by subtracting 24 hours from the instant. A day is 23 or
  // 25 hours long across a DST change, so an instant 24 hours back lands two
  // days earlier in the hour after a spring-forward — which labelled a
  // two-day-old message "Yesterday" — and stays on today after a fall-back,
  // where nothing could say "Yesterday" at all. `Date.UTC` carries the month
  // and year rollover. (TAC-408.)
  const [year, month, day] = todayKey.split('-').map(Number);
  const yesterdayKey = new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);

  let dayLabel: string;
  if (key === todayKey) {
    dayLabel = 'Today';
  } else if (key === yesterdayKey) {
    dayLabel = 'Yesterday';
  } else {
    // `formatToParts` lets us read DOW / month / day without locale-specific
    // separators leaking into the output.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).formatToParts(date);
    const get = (type: string): string =>
      parts.find((p) => p.type === type)?.value ?? '';
    dayLabel = `${get('weekday')} ${get('month')} ${get('day')}`;
  }

  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  return `${dayLabel} · ${time}`;
}

/** The device's IANA zone — the v1 stand-in for the venue's. */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
