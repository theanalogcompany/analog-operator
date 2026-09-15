import {
  formatConversationsSince,
  formatConversationTime,
  isConversationActive,
  minutesSince,
} from '@/lib/conversations-format';

const NOW = Date.parse('2026-09-05T21:41:00.000Z');

describe('minutesSince', () => {
  it('returns elapsed minutes, floored at 0', () => {
    expect(minutesSince('2026-09-05T21:40:00.000Z', NOW)).toBe(1);
    expect(minutesSince('2026-09-05T21:41:30.000Z', NOW)).toBe(0);
  });
});

describe('formatConversationTime', () => {
  it('returns "now" for under a minute', () => {
    expect(formatConversationTime('2026-09-05T21:40:45.000Z', NOW)).toBe('now');
  });

  it('returns compact minutes under an hour', () => {
    expect(formatConversationTime('2026-09-05T21:39:00.000Z', NOW)).toBe('2m');
  });

  it('returns compact hours under a day', () => {
    expect(formatConversationTime('2026-09-05T18:41:00.000Z', NOW)).toBe('3h');
  });

  it('returns compact days beyond a day', () => {
    expect(formatConversationTime('2026-09-02T21:41:00.000Z', NOW)).toBe('3d');
  });
});

describe('isConversationActive', () => {
  it('is active exactly at the window boundary', () => {
    expect(isConversationActive('2026-09-05T20:41:00.000Z', 60, NOW)).toBe(true);
  });

  it('is inactive just past the window', () => {
    expect(isConversationActive('2026-09-05T20:40:00.000Z', 60, NOW)).toBe(false);
  });
});

describe('formatConversationsSince', () => {
  // Explicit IANA timezone, consistently applied across this describe block
  // (mirrors thread-cluster.test.ts's fixed zones for the day separators).
  // The specific zone matters for the year-boundary test below — see its
  // comment.
  const TIMEZONE = 'America/Los_Angeles';

  it('returns "first conversation" when count is 1', () => {
    expect(formatConversationsSince(1, '2026-09-05T18:00:00.000Z', TIMEZONE, NOW)).toBe(
      'first conversation',
    );
  });

  it('returns a month label when the first conversation was this year', () => {
    expect(formatConversationsSince(4, '2026-06-10T18:00:00.000Z', TIMEZONE, NOW)).toBe(
      '4 conversations since June',
    );
  });

  it('returns a bare year label when the first conversation was a prior year', () => {
    expect(formatConversationsSince(44, '2024-11-08T18:00:00.000Z', TIMEZONE, NOW)).toBe(
      '44 conversations since 2024',
    );
  });

  // formatConversationsSince takes an explicit IANA timezone (mirrors
  // lib/thread-cluster.ts's day separators) instead of reading the
  // JS runtime's ambient local time, specifically so its output is
  // deterministic and testable regardless of what machine or CI runner
  // executes it. This pins firstConversationAt to
  // '2025-01-01T05:00:00.000Z' — already Jan 1 in UTC, but still Dec 31
  // 2024 in America/Los_Angeles — so the expected "...since 2024" answer
  // only holds if the function actually reads the `timezone` parameter
  // rather than falling back to `Date.prototype.getFullYear()`'s ambient
  // local time (which, on the ubuntu-latest GitHub Actions runners this
  // repo's CI uses, is UTC — see .github/workflows/ci.yml). Verified this
  // assertion fails when the implementation is reverted to
  // `getFullYear()`/`getUTCFullYear()`, including under
  // `TZ=UTC npx jest __tests__/lib/conversations-format.test.ts` — the
  // exact ambient timezone CI runs under.
  it('resolves the year-boundary case against the explicit timezone parameter, not ambient local time', () => {
    const firstConversationAt = '2025-01-01T05:00:00.000Z';
    const nowMs = Date.parse('2025-06-01T12:00:00.000Z');

    expect(formatConversationsSince(7, firstConversationAt, TIMEZONE, nowMs)).toBe(
      '7 conversations since 2024',
    );
  });
});
