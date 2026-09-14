import { fireEvent, render, screen } from '@testing-library/react-native';

import { TopNav } from '@/components/shell/top-nav';

const mockReplace = jest.fn();
let mockPathname = '/queue';
let mockPermission = 'granted';
const mockQueue = { drafts: [] as unknown[], commitments: [] as unknown[] };

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => mockPathname,
}));
jest.mock('@/lib/queue-context', () => ({ useQueueContext: () => mockQueue }));
jest.mock('@/hooks/use-notification-permission', () => ({
  useNotificationPermission: () => mockPermission,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname = '/queue';
  mockPermission = 'granted';
  mockQueue.drafts = [];
  mockQueue.commitments = [];
});

/** The nav row's three column wrappers, in order. */
function columns() {
  const root = render(<TopNav />).toJSON();
  const row = Array.isArray(root) ? root[0] : root;
  return (row?.children ?? []) as { props: { style?: Record<string, unknown> } }[];
}

describe('TopNav — the three-column layout', () => {
  // The handoff calls this out as the detail most likely to be "simplified"
  // into `justify-content: space-between`. It looks equivalent and is not:
  // space-between centers the middle item between its NEIGHBOURS, so "Texts"
  // drifts right as the queue count grows and stops sitting under the dynamic
  // island. flex 1 / flex 0 / flex 1 is what actually centers it.
  it('gives the outer columns flex 1 and the middle column flex 0', () => {
    const [left, middle, right] = columns();
    expect(left.props.style).toMatchObject({ flex: 1, alignItems: 'flex-start' });
    expect(middle.props.style).toMatchObject({ flex: 0 });
    expect(right.props.style).toMatchObject({ flex: 1, alignItems: 'flex-end' });
  });

  it('does not use space-between on the row', () => {
    const root = render(<TopNav />).toJSON();
    const row = Array.isArray(root) ? root[0] : root;
    expect(row?.props?.style?.justifyContent).toBeUndefined();
  });

  it('keeps the columns centered as the queue count grows', () => {
    mockQueue.drafts = new Array(128).fill({});
    const [left, middle, right] = columns();
    expect(left.props.style).toMatchObject({ flex: 1 });
    expect(middle.props.style).toMatchObject({ flex: 0 });
    expect(right.props.style).toMatchObject({ flex: 1 });
  });
});

describe('TopNav — tabs', () => {
  it('renders all three tabs', () => {
    render(<TopNav />);
    expect(screen.getByLabelText('Queue')).toBeTruthy();
    expect(screen.getByLabelText('Texts')).toBeTruthy();
    expect(screen.getByLabelText('You')).toBeTruthy();
  });

  it('shows the live queue count beside its label', () => {
    mockQueue.drafts = [{}, {}, {}];
    render(<TopNav />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('announces the count additively, without replacing the label', () => {
    // An explicit accessibilityLabel replaces an element's entire announced
    // content, so folding the count into the label would drop it from
    // VoiceOver. accessibilityValue is announced alongside.
    mockQueue.drafts = [{}, {}];
    render(<TopNav />);
    const tab = screen.getByLabelText('Queue');
    expect(tab.props.accessibilityValue).toEqual({ text: '2 pending' });
  });

  it.each([
    ['/queue', 'Queue'],
    ['/conversations', 'Texts'],
    ['/you', 'You'],
  ])('marks the tab for %s as selected', (path, label) => {
    mockPathname = path;
    render(<TopNav />);
    expect(screen.getByLabelText(label).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('keeps Texts active while a thread is open', () => {
    mockPathname = '/conversations/c0111111-1111-4111-8111-111111111111';
    render(<TopNav />);
    expect(screen.getByLabelText('Texts').props.accessibilityState).toMatchObject(
      { selected: true },
    );
  });

  it('switches tabs with replace, so the back stack never grows', () => {
    render(<TopNav />);
    fireEvent.press(screen.getByLabelText('You'));
    expect(mockReplace).toHaveBeenCalledWith('/you');
  });
});

describe('TopNav — the notification dot', () => {
  it('marks You when push permission is denied', () => {
    // An operator who can't be notified needs to know without a banner eating
    // the top of the queue.
    mockPermission = 'denied';
    render(<TopNav />);
    expect(screen.getByLabelText('You').props.accessibilityHint).toBe(
      'Push notifications are off',
    );
  });

  it('stays clean when permission is granted', () => {
    mockPermission = 'granted';
    render(<TopNav />);
    expect(screen.getByLabelText('You').props.accessibilityHint).toBeUndefined();
  });

  it('stays clean while permission is still resolving', () => {
    // 'loading' is not 'denied'. Flashing a warning dot on every cold launch
    // would train the operator to ignore it.
    mockPermission = 'loading';
    render(<TopNav />);
    expect(screen.getByLabelText('You').props.accessibilityHint).toBeUndefined();
  });
});
