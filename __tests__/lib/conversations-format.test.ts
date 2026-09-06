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
});
