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
  it('returns "first conversation" when count is 1', () => {
    expect(formatConversationsSince(1, '2026-09-05T18:00:00.000Z', NOW)).toBe(
      'first conversation',
    );
  });

  it('returns a month label when the first conversation was this year', () => {
    expect(formatConversationsSince(4, '2026-06-10T18:00:00.000Z', NOW)).toBe(
      '4 conversations since June',
    );
  });

  it('returns a bare year label when the first conversation was a prior year', () => {
    expect(formatConversationsSince(44, '2024-11-08T18:00:00.000Z', NOW)).toBe(
      '44 conversations since 2024',
    );
  });

  // The same-year/prior-year check is deliberately local-device-time, not
  // UTC (see the rationale comment on formatConversationsSince). This pins
  // firstConversationAt to '2025-01-01T05:00:00.000Z' — already Jan 1 in
  // UTC, but still Dec 31 2024 on a device west of UTC (e.g. anywhere in
  // the US) — the exact class of instant where a local-time read and a UTC
  // read of "what year is this" disagree. The expectation below is derived
  // with the same local Date/Intl primitives the implementation uses (not
  // hardcoded to one timezone), so it passes under whatever timezone the
  // test runner happens to be in — jest-expo's custom test environment
  // fixes ICU/TZ at worker startup, so a per-test `process.env.TZ` override
  // does not take effect here; ambient TZ is the only lever available. A
  // future change that swapped in `getUTCFullYear()` / a `timeZone: 'UTC'`
  // Intl option would diverge from this derived expectation on any machine
  // whose local timezone isn't itself UTC (verified: forcing the
  // implementation to UTC math makes this exact test fail), and fail loudly
  // here instead of only misbehaving on a real device at an inconvenient
  // hour.
  it('resolves the year-boundary case using local device time, not UTC', () => {
    const firstConversationAt = '2025-01-01T05:00:00.000Z';
    const nowMs = Date.parse('2025-06-01T12:00:00.000Z');

    const firstLocalYear = new Date(firstConversationAt).getFullYear();
    const nowLocalYear = new Date(nowMs).getFullYear();
    const expectedLabel =
      firstLocalYear === nowLocalYear
        ? new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
            new Date(firstConversationAt),
          )
        : String(firstLocalYear);

    expect(formatConversationsSince(7, firstConversationAt, nowMs)).toBe(
      `7 conversations since ${expectedLabel}`,
    );
  });
});
