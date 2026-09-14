import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { type ThreadItem } from '@/lib/thread-cluster';
import { dividerBacking } from '@/lib/theme';

const ITEMS: ThreadItem[] = [
  { kind: 'timestamp', key: 'ts-1', label: 'Fri Sep 5 · evening' },
  {
    kind: 'bubble',
    key: 'b-1',
    position: 'only',
    message: { id: '1', direction: 'inbound', body: 'hey there', createdAt: '2026-09-05T20:00:00.000Z' },
  },
  {
    kind: 'bubble',
    key: 'b-2',
    position: 'only',
    message: { id: '2', direction: 'outbound', body: 'hi!', createdAt: '2026-09-05T20:01:00.000Z' },
  },
];

describe('ThreadBubbleList', () => {
  it('renders the timestamp label', () => {
    render(<ThreadBubbleList items={ITEMS} />);
    // Dividers render as tracked caps; the un-uppercased string stays as the
    // accessibility label so VoiceOver doesn't spell it out.
    expect(screen.getByText('FRI SEP 5 · EVENING')).toBeTruthy();
    expect(screen.getByLabelText('Fri Sep 5 · evening')).toBeTruthy();
  });

  it('renders both bubble bodies', () => {
    render(<ThreadBubbleList items={ITEMS} />);
    expect(screen.getByText('hey there')).toBeTruthy();
    expect(screen.getByText('hi!')).toBeTruthy();
  });

  // The value is justified by __tests__/lib/ground-contrast.test.ts. This checks
  // the backing reaches the screen, and only the one that needs it. (TAC-364.)
  it('backs a divider on the edit takeover, where it sits on a card ground', () => {
    render(<ThreadBubbleList items={ITEMS} surface="card" />);
    const backing = screen.getByTestId('thread-divider-backing');
    expect(StyleSheet.flatten(backing.props.style).backgroundColor).toBe(dividerBacking.color);
    expect(within(backing).getByText('FRI SEP 5 · EVENING')).toBeTruthy();
  });

  it('leaves the Texts thread unbacked, since clay clears 4.5:1 alone', () => {
    render(<ThreadBubbleList items={ITEMS} surface="thread" />);
    expect(screen.queryByTestId('thread-divider-backing')).toBeNull();
    expect(screen.getByText('FRI SEP 5 · EVENING')).toBeTruthy();
  });
});
