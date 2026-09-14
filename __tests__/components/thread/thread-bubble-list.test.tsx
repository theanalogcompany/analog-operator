import { render, screen } from '@testing-library/react-native';

import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { type ThreadItem } from '@/lib/thread-cluster';

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
});
