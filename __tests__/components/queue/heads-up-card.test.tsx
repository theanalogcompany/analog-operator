import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HeadsUpCard } from '@/components/queue/heads-up-card';
import { type HeadsUpCommitment } from '@/lib/api/queue';
import { card } from '@/lib/theme';

const commitment: HeadsUpCommitment = {
  id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
  venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  guestId: 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
  type: 'comp',
  guest: { name: 'Sam' },
  description: 'A cortado on the house',
  code: '7K2P',
  expected_arrival: null,
  created_at: '2026-09-14T08:00:00.000Z',
  recognitionState: 'regular',
  sourceMessageId: null,
};

type Node = { props: { style?: unknown }; parent: Node | null };

/** The nearest background colour at or above a rendered node. */
function backgroundOf(start: Node): string | undefined {
  for (let cursor: Node | null = start; cursor; cursor = cursor.parent) {
    const style = StyleSheet.flatten(cursor.props.style as never) as
      | { backgroundColor?: string }
      | undefined;
    if (style?.backgroundColor) return style.backgroundColor;
  }
  return undefined;
}

// The commitment's conversation often predates the arrival by a day or more,
// so this card's tail crosses midnight more often than a draft card's. It runs
// through the same rule, in the device's zone. (TAC-408.)
describe('HeadsUpCard — conversation', () => {
  const tail = [
    {
      id: 'dd11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      direction: 'inbound' as const,
      body: 'see you tomorrow',
      createdAt: new Date(2026, 8, 10, 23, 50).toISOString(),
    },
    {
      id: 'ff11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      direction: 'inbound' as const,
      body: 'just parked',
      createdAt: new Date(2026, 8, 11, 0, 10).toISOString(),
    },
  ];

  it('separates the days when the tail crosses midnight', () => {
    // `now` is pinned to the morning after the second message, so the two days
    // read as Yesterday and Today. The card passes this same clock to the
    // separators, so the labels are assertable rather than merely countable.
    render(
      <HeadsUpCard
        commitment={{
          ...commitment,
          created_at: new Date(2026, 8, 11, 0, 15).toISOString(),
        }}
        height={card.heightPx}
        thread={tail}
        now={new Date(2026, 8, 11, 9, 0)}
      />,
    );
    expect(screen.getByText('YESTERDAY · 11:50 PM')).toBeTruthy();
    expect(screen.getByText('TODAY · 12:10 AM')).toBeTruthy();
  });
});

describe('HeadsUpCard — flag strip', () => {
  // A heads-up card carries no review reason to derive a bucket from, so it
  // names its own: Bay, the strip from TAC-364's design spec. Nothing else
  // checks this card's colour; the draft card's tests can't see it.
  it('sits on the Bay strip', () => {
    render(
      <HeadsUpCard
        commitment={commitment}
        height={card.heightPx}
        now={new Date('2026-09-14T09:00:00.000Z')}
      />,
    );
    expect(backgroundOf(screen.getByText('COMMITMENT · DUE NOW') as unknown as Node)).toBe(
      '#4F563E',
    );
  });
});
