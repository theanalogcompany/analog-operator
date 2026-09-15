import type { ThreadMessage } from '@/lib/api/queue';
import { computeItems, type ThreadItem } from '@/lib/thread-cluster';

const UTC = 'UTC';
const PT = 'America/Los_Angeles';
// 2026-09-13 19:14 Pacific — so in PT "Today" is Sep 13 and "Yesterday" is
// Sep 12, while in UTC the same instant is already Sep 14. Fixed rather than
// read from the clock: a label that said "Today" only while the suite happened
// to run on the right day would pin nothing.
const NOW = Date.parse('2026-09-14T02:14:00Z');

function msg(args: {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  iso: string;
}): ThreadMessage {
  return {
    id: args.id,
    direction: args.direction,
    body: args.body,
    createdAt: args.iso,
  };
}

/** An inbound thread, one message at each of the given instants. */
function threadAt(isos: string[]): ThreadMessage[] {
  return isos.map((iso, i) =>
    msg({ id: `m${i}`, direction: 'inbound', body: `${i}`, iso }),
  );
}

function separatorLabels(items: ThreadItem[]): string[] {
  return items.flatMap((item) => (item.kind === 'timestamp' ? [item.label] : []));
}

/** The label above a lone message — the separator text, isolated. */
function labelFor(iso: string, timezone: string, nowMs: number = NOW): string {
  const [first] = computeItems(
    [msg({ id: 'only', direction: 'inbound', body: 'x', iso })],
    timezone,
    nowMs,
  );
  if (first.kind !== 'timestamp') {
    throw new Error('expected a separator above the first message');
  }
  return first.label;
}

describe('computeItems', () => {
  it('returns [] for an empty thread', () => {
    expect(computeItems([], UTC)).toEqual([]);
  });

  it('emits a single timestamp row followed by an only-bubble for one message', () => {
    const items = computeItems(
      [msg({ id: 'a', direction: 'inbound', body: 'hi', iso: '2026-05-14T16:00:00.000Z' })],
      UTC,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'timestamp' });
    expect(items[1]).toMatchObject({ kind: 'bubble', position: 'only' });
  });

  it('collapses two same-direction messages within 60s into a first/last chain (no timestamp between)', () => {
    const items = computeItems(
      [
        msg({ id: 'a', direction: 'inbound', body: 'one', iso: '2026-05-14T16:00:00.000Z' }),
        msg({ id: 'b', direction: 'inbound', body: 'two', iso: '2026-05-14T16:00:30.000Z' }),
      ],
      UTC,
    );
    expect(items.map((i) => i.kind)).toEqual(['timestamp', 'bubble', 'bubble']);
    expect(items[1]).toMatchObject({ kind: 'bubble', position: 'first' });
    expect(items[2]).toMatchObject({ kind: 'bubble', position: 'last' });
  });

  it('promotes middle bubble in a 3-chain', () => {
    const items = computeItems(
      [
        msg({ id: 'a', direction: 'inbound', body: '1', iso: '2026-05-14T16:00:00.000Z' }),
        msg({ id: 'b', direction: 'inbound', body: '2', iso: '2026-05-14T16:00:20.000Z' }),
        msg({ id: 'c', direction: 'inbound', body: '3', iso: '2026-05-14T16:00:50.000Z' }),
      ],
      UTC,
    );
    const positions = items
      .filter((i) => i.kind === 'bubble')
      .map((i) => (i.kind === 'bubble' ? i.position : null));
    expect(positions).toEqual(['first', 'middle', 'last']);
  });

  it('breaks the chain when direction flips', () => {
    const items = computeItems(
      [
        msg({ id: 'a', direction: 'inbound', body: '1', iso: '2026-05-14T16:00:00.000Z' }),
        msg({ id: 'b', direction: 'outbound', body: '2', iso: '2026-05-14T16:00:20.000Z' }),
      ],
      UTC,
    );
    const positions = items
      .filter((i) => i.kind === 'bubble')
      .map((i) => (i.kind === 'bubble' ? i.position : null));
    expect(positions).toEqual(['only', 'only']);
  });

  it('breaks the chain when same-direction messages are >60s apart', () => {
    const items = computeItems(
      [
        msg({ id: 'a', direction: 'inbound', body: '1', iso: '2026-05-14T16:00:00.000Z' }),
        // 61s later — same direction but past the sequenceGapMs window
        msg({ id: 'b', direction: 'inbound', body: '2', iso: '2026-05-14T16:01:01.000Z' }),
      ],
      UTC,
    );
    const positions = items
      .filter((i) => i.kind === 'bubble')
      .map((i) => (i.kind === 'bubble' ? i.position : null));
    expect(positions).toEqual(['only', 'only']);
  });

  it('emits a stable timestamp key derived from the first bubble id', () => {
    const items = computeItems(
      [msg({ id: 'first-msg-id', direction: 'inbound', body: 'x', iso: '2026-05-14T16:00:00.000Z' })],
      UTC,
    );
    expect(items[0].key).toBe('ts-first-msg-id');
  });
});

// Separators mark calendar days. This block replaces the gap-based tests this
// file used to carry, which pinned a fresh divider after every five-minute
// pause — several of them on one day, which is what TAC-408 was filed for.
describe('computeItems — day separators', () => {
  it('keeps one separator when a long gap stays inside one day', () => {
    // 08:00 and 14:00 Pacific, six hours apart and both on Sep 13.
    const items = computeItems(
      threadAt(['2026-09-13T15:00:00.000Z', '2026-09-13T21:00:00.000Z']),
      PT,
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual(['timestamp', 'bubble', 'bubble']);
    expect(separatorLabels(items)).toEqual(['Today · 8:00 AM']);
  });

  it('keeps one separator when messages are minutes apart', () => {
    const items = computeItems(
      threadAt(['2026-09-13T15:00:00.000Z', '2026-09-13T15:04:00.000Z']),
      PT,
      NOW,
    );
    expect(separatorLabels(items)).toHaveLength(1);
  });

  it('gives a day with several long gaps exactly one separator', () => {
    // 08:00, 09:00, 12:30 and 18:45 Pacific: four messages, three gaps, all
    // far longer than the five minutes that used to start a new divider.
    const items = computeItems(
      threadAt([
        '2026-09-13T15:00:00.000Z',
        '2026-09-13T16:00:00.000Z',
        '2026-09-13T19:30:00.000Z',
        '2026-09-14T01:45:00.000Z',
      ]),
      PT,
      NOW,
    );
    expect(separatorLabels(items)).toEqual(['Today · 8:00 AM']);
  });

  it('starts a separator at midnight in the given zone', () => {
    // 23:50 and 00:10 Pacific: twenty minutes apart, two calendar days.
    const items = computeItems(
      threadAt(['2026-09-14T06:50:00.000Z', '2026-09-14T07:10:00.000Z']),
      PT,
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual([
      'timestamp',
      'bubble',
      'timestamp',
      'bubble',
    ]);
    expect(separatorLabels(items)).toEqual([
      'Today · 11:50 PM',
      'Mon Sep 14 · 12:10 AM',
    ]);
  });

  it('takes the day in the given zone, not UTC', () => {
    // 16:50 and 17:10 Pacific — one Pacific afternoon, but they straddle UTC
    // midnight. The same two messages split in UTC and don't in Pacific.
    const messages = threadAt([
      '2026-09-13T23:50:00.000Z',
      '2026-09-14T00:10:00.000Z',
    ]);
    expect(separatorLabels(computeItems(messages, PT, NOW))).toEqual([
      'Today · 4:50 PM',
    ]);
    expect(separatorLabels(computeItems(messages, UTC, NOW))).toEqual([
      'Yesterday · 11:50 PM',
      'Today · 12:10 AM',
    ]);
  });

  it('marks three consecutive days with three separators, never adjacent', () => {
    // 10:00 Pacific on Sep 11, 12 and 13.
    const items = computeItems(
      threadAt([
        '2026-09-11T17:00:00.000Z',
        '2026-09-12T17:00:00.000Z',
        '2026-09-13T17:00:00.000Z',
      ]),
      PT,
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual([
      'timestamp',
      'bubble',
      'timestamp',
      'bubble',
      'timestamp',
      'bubble',
    ]);
    expect(separatorLabels(items)).toEqual([
      'Fri Sep 11 · 10:00 AM',
      'Yesterday · 10:00 AM',
      'Today · 10:00 AM',
    ]);
    // Every separator is followed by the message it introduces, which is what
    // makes "never two in a row" true however the days fall.
    items.forEach((item, i) => {
      if (item.kind === 'timestamp') {
        expect(items[i + 1]?.kind).toBe('bubble');
      }
    });
  });
});

describe('the day separator label', () => {
  it('says "Today" with an exact clock time', () => {
    expect(labelFor('2026-09-14T02:14:00Z', PT)).toBe('Today · 7:14 PM');
  });

  it('says "Yesterday" for the previous calendar day in that zone', () => {
    expect(labelFor('2026-09-13T02:14:00Z', PT)).toBe('Yesterday · 7:14 PM');
  });

  it('names the day for anything older', () => {
    expect(labelFor('2026-09-10T02:14:00Z', PT)).toBe('Wed Sep 9 · 7:14 PM');
  });

  it('is relative to the given zone, not the runner’s', () => {
    // `now` is Sep 13 evening in Pacific but already Sep 14 in UTC. An instant
    // from Sep 13 afternoon Pacific is therefore "Today" in Pacific and
    // "Yesterday" in UTC — the same instant, two honest answers. A divider that
    // read the runner's ambient zone would flip between CI and a laptop.
    const instant = '2026-09-13T20:00:00Z';
    expect(labelFor(instant, PT)).toBe('Today · 1:00 PM');
    expect(labelFor(instant, UTC)).toBe('Yesterday · 8:00 PM');
  });

  it('renders midnight as 12 AM, not 0 AM', () => {
    // Midnight Pacific on the same calendar day as `now`.
    expect(labelFor('2026-09-13T07:00:00Z', PT)).toBe('Today · 12:00 AM');
  });

  it('uses tomorrow’s date rather than claiming "Today"', () => {
    // A clock-skewed server timestamp is not a reason to render a lie.
    expect(labelFor('2026-09-14T07:00:00Z', PT)).toBe('Mon Sep 14 · 12:00 AM');
  });

  it('renders noon as 12 PM', () => {
    expect(labelFor('2026-09-13T19:00:00Z', PT)).toBe('Today · 12:00 PM');
  });

  it('calls a 9:39 AM message 9:39 AM', () => {
    // The reported defect: this message read "night" under the format this
    // replaced, because the two screens used different formatters. (TAC-408.)
    expect(labelFor('2026-09-13T16:39:00Z', PT)).toBe('Today · 9:39 AM');
  });

  it('names an older day without a year', () => {
    // Last September reads exactly like this September. Recorded rather than
    // fixed: a year is a change to the ruled label shape, and the Conversations
    // thread is the only surface that reaches back far enough to notice.
    expect(labelFor('2025-09-10T16:39:00Z', PT)).toBe('Wed Sep 10 · 9:39 AM');
  });

  // A calendar day is 23 or 25 hours long around a DST change, so "yesterday"
  // is today's date minus one day, not the instant 24 hours ago. Both cases
  // below were wrong before the review that caught them. (TAC-408.)
  describe('across a daylight-saving change', () => {
    // 2026-03-09 00:30 Pacific: half an hour into the day after the clocks
    // went forward.
    const AFTER_SPRING_FORWARD = Date.parse('2026-03-09T07:30:00Z');

    it('calls the real previous day "Yesterday"', () => {
      // Sunday Mar 8, noon Pacific.
      expect(labelFor('2026-03-08T19:00:00Z', PT, AFTER_SPRING_FORWARD)).toBe(
        'Yesterday · 12:00 PM',
      );
    });

    it('does not call a two-day-old message "Yesterday"', () => {
      // Saturday Mar 7, noon Pacific. An instant 24 hours before `now` lands
      // here, which is how this message used to claim to be yesterday's.
      expect(labelFor('2026-03-07T20:00:00Z', PT, AFTER_SPRING_FORWARD)).toBe(
        'Sat Mar 7 · 12:00 PM',
      );
    });

    it('still finds yesterday on the longer day', () => {
      // 2026-11-01 23:30 Pacific, after the clocks went back: the instant 24
      // hours earlier is still Nov 1, so nothing could read "Yesterday".
      const afterFallBack = Date.parse('2026-11-02T07:30:00Z');
      expect(labelFor('2026-10-31T19:00:00Z', PT, afterFallBack)).toBe(
        'Yesterday · 12:00 PM',
      );
    });
  });

  it('never names a time of day, at any hour', () => {
    for (let hour = 0; hour < 24; hour++) {
      const iso = `2026-09-13T${String(hour).padStart(2, '0')}:39:00.000Z`;
      expect(labelFor(iso, PT)).not.toMatch(/morning|afternoon|evening|night/i);
      expect(labelFor(iso, UTC)).not.toMatch(/morning|afternoon|evening|night/i);
    }
  });
});
