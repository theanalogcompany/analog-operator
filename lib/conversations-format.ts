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
 * Takes an explicit IANA `timezone` (same pattern as
 * `lib/thread-cluster.ts`'s day separators) rather than reading
 * the JS runtime's ambient local time, so the same-year/prior-year check is
 * deterministic regardless of what machine or CI runner executes it. Near a
 * year boundary, different timezones can legitimately name different
 * calendar years for the same instant — callers decide which timezone that
 * should be. Callers without a venue timezone yet should pass
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` (the device's own
 * zone), the same fallback used in `app/queue/edit.tsx` for
 * `venueTimezone`.
 */
export function formatConversationsSince(
  count: number,
  firstConversationAt: string,
  timezone: string,
  nowMs: number = Date.now(),
): string {
  if (count <= 1) return 'first conversation';
  const first = new Date(firstConversationAt);
  const now = new Date(nowMs);
  const yearIn = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(date);
  const firstYear = yearIn(first);
  const label =
    firstYear === yearIn(now)
      ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'long' }).format(first)
      : firstYear;
  return `${count} conversations since ${label}`;
}
