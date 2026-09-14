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
