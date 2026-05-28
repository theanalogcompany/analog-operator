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

// 5–11: morning, 12–16: afternoon, 17–20: evening, else: night. Mirrors
// analog-guest/app/admin/(authed)/conversations/_components/conversation-thread.tsx
function periodOf(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Formats a thread cluster header timestamp as "EEE MMM d · period" in the
 * given IANA timezone. Pilot v1 passes the device timezone because the API
 * doesn't yet plumb the venue's timezone; for operators physically at the
 * venue these are identical. Follow-up to add `venueTimezone` to the queue
 * payload.
 */
export function formatClusterTimestamp(iso: string, timezone: string): string {
  const date = new Date(iso);
  // `formatToParts` lets us read DOW / month / day without locale-specific
  // separators leaking into the output.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const month = get('month');
  const day = get('day');
  const hourStr = get('hour');
  // `hour: 'numeric'` with hour12: false returns '0'–'23' in en-US, except
  // midnight comes back as '24' in some Node Intl builds — normalize.
  const rawHour = Number.parseInt(hourStr, 10);
  const hour = Number.isFinite(rawHour) ? rawHour % 24 : 0;
  return `${weekday} ${month} ${day} · ${periodOf(hour)}`;
}

function ms(iso: string): number {
  return Date.parse(iso);
}

/**
 * Groups a chronological message array (oldest → newest, ASC by createdAt)
 * into rendered items: cluster-header timestamps every >5min gap (or before
 * the first message), and bubbles annotated with their position in the
 * same-direction chain. Sequence chains break when direction flips or when
 * consecutive same-direction messages are >60s apart.
 *
 * Assumes input is already sorted ASC. Returns [] for empty input.
 */
export function computeItems(
  messages: ThreadMessage[],
  timezone: string,
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

  // Pass 2: interleave timestamp rows when the gap from the previous message
  // exceeds timestampGapMs (always emit one before the first message).
  const items: ThreadItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const needsTimestamp =
      i === 0 || ms(msg.createdAt) - ms(messages[i - 1].createdAt) > thread.timestampGapMs;
    if (needsTimestamp) {
      items.push({
        kind: 'timestamp',
        key: `ts-${msg.id}`,
        label: formatClusterTimestamp(msg.createdAt, timezone),
      });
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
