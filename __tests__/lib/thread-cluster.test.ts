import type { ThreadMessage } from '@/lib/api/queue';
import { computeItems, formatClusterTimestamp } from '@/lib/thread-cluster';

const UTC = 'UTC';

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

  it('inserts a new timestamp row when consecutive messages are >5min apart', () => {
    const items = computeItems(
      [
        msg({ id: 'a', direction: 'inbound', body: '1', iso: '2026-05-14T16:00:00.000Z' }),
        // 6m later — past timestampGapMs, fresh cluster header
        msg({ id: 'b', direction: 'inbound', body: '2', iso: '2026-05-14T16:06:00.000Z' }),
      ],
      UTC,
    );
    expect(items.map((i) => i.kind)).toEqual([
      'timestamp',
      'bubble',
      'timestamp',
      'bubble',
    ]);
  });

  it('does not insert a timestamp row when consecutive messages are within 5min', () => {
    const items = computeItems(
      [
        msg({ id: 'a', direction: 'inbound', body: '1', iso: '2026-05-14T16:00:00.000Z' }),
        // 4m later — under timestampGapMs
        msg({ id: 'b', direction: 'inbound', body: '2', iso: '2026-05-14T16:04:00.000Z' }),
      ],
      UTC,
    );
    const tsCount = items.filter((i) => i.kind === 'timestamp').length;
    expect(tsCount).toBe(1);
  });

  it('emits a stable timestamp key derived from the first bubble id', () => {
    const items = computeItems(
      [msg({ id: 'first-msg-id', direction: 'inbound', body: 'x', iso: '2026-05-14T16:00:00.000Z' })],
      UTC,
    );
    expect(items[0].key).toBe('ts-first-msg-id');
  });
});

describe('formatClusterTimestamp', () => {
  it('buckets to "morning" for 5–11 local hours', () => {
    expect(formatClusterTimestamp('2026-05-14T07:00:00.000Z', UTC)).toContain('morning');
    expect(formatClusterTimestamp('2026-05-14T11:59:00.000Z', UTC)).toContain('morning');
  });

  it('buckets to "afternoon" for 12–16 local hours', () => {
    expect(formatClusterTimestamp('2026-05-14T12:00:00.000Z', UTC)).toContain('afternoon');
    expect(formatClusterTimestamp('2026-05-14T16:59:00.000Z', UTC)).toContain('afternoon');
  });

  it('buckets to "evening" for 17–20 local hours', () => {
    expect(formatClusterTimestamp('2026-05-14T17:00:00.000Z', UTC)).toContain('evening');
    expect(formatClusterTimestamp('2026-05-14T20:59:00.000Z', UTC)).toContain('evening');
  });

  it('buckets to "night" for everything else (21–4 local)', () => {
    expect(formatClusterTimestamp('2026-05-14T22:00:00.000Z', UTC)).toContain('night');
    expect(formatClusterTimestamp('2026-05-14T02:30:00.000Z', UTC)).toContain('night');
  });

  it('respects the supplied IANA timezone (period flips between UTC and America/Los_Angeles)', () => {
    // 02:00 UTC = 19:00 PT the previous day → "evening" PT, "night" UTC.
    const iso = '2026-05-15T02:00:00.000Z';
    expect(formatClusterTimestamp(iso, UTC)).toContain('night');
    expect(formatClusterTimestamp(iso, 'America/Los_Angeles')).toContain('evening');
  });

  it('emits "EEE MMM d · period" shape', () => {
    const label = formatClusterTimestamp('2026-05-14T16:00:00.000Z', UTC);
    // Some Node Intl builds insert ", " between weekday and month — accept
    // either with or without commas as long as the four tokens are present.
    expect(label).toMatch(/^[A-Z][a-z]{2}\W+[A-Z][a-z]{2}\W+\d{1,2}\W+·\W+(morning|afternoon|evening|night)$/);
  });
});
