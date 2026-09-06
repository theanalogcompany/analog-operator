// Pure time/label formatting for the Conversations tab. All functions take
// an explicit `nowMs` for deterministic testing; callers omit it to use the
// real clock.

export function minutesSince(iso: string, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
}

/** Compact relative time for a conversation-list row: "now" / "2m" / "3h" / "3d". */
export function formatConversationTime(iso: string, nowMs: number = Date.now()): string {
  const mins = minutesSince(iso, nowMs);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function isConversationActive(
  iso: string,
  windowMins: number,
  nowMs: number = Date.now(),
): boolean {
  return minutesSince(iso, nowMs) <= windowMins;
}

/**
 * "first conversation" when there's only ever been one, otherwise
 * "N conversations since {Month}" (this year) or "N conversations since
 * {Year}" (a prior year) — matches the imported design's two label modes.
 *
 * The same-year/prior-year check (`first.getFullYear() === now.getFullYear()`)
 * and the month label (`Intl.DateTimeFormat(...).format(first)`) deliberately
 * read the device's local wall-clock time, not UTC. This mirrors
 * `lib/thread-cluster.ts`'s documented choice: the queue/conversation payload
 * doesn't carry a venue timezone yet, so device-local time is the only
 * timezone available, and for an operator physically at the venue it matches
 * the venue's own clock. Near a year boundary, local time and UTC can name
 * different calendar years for the same instant — that's expected here, not
 * a bug. See the year-boundary test in
 * `__tests__/lib/conversations-format.test.ts` for the concrete divergence.
 */
export function formatConversationsSince(
  count: number,
  firstConversationAt: string,
  nowMs: number = Date.now(),
): string {
  if (count <= 1) return 'first conversation';
  const first = new Date(firstConversationAt);
  const now = new Date(nowMs);
  const label =
    first.getFullYear() === now.getFullYear()
      ? new Intl.DateTimeFormat('en-US', { month: 'long' }).format(first)
      : String(first.getFullYear());
  return `${count} conversations since ${label}`;
}
