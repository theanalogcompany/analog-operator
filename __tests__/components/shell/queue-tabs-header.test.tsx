import { fireEvent, render, screen } from '@testing-library/react-native';

import { QueueTabsHeader } from '@/components/shell/queue-tabs-header';
import { type UseQueueResult } from '@/hooks/use-queue';

let mockPathname = '/queue';
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

const mockQueue: UseQueueResult = {
  drafts: [{ messageId: '1' } as any, { messageId: '2' } as any],
  status: 'ready',
  error: null,
  reload: jest.fn(),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
};
jest.mock('@/lib/queue-context', () => ({ useQueueContext: () => mockQueue }));

beforeEach(() => {
  mockPathname = '/queue';
  mockReplace.mockClear();
});

describe('QueueTabsHeader', () => {
  it('renders the logo and menu button', () => {
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    expect(screen.getByLabelText('Analog')).toBeTruthy();
    expect(screen.getByLabelText('Open menu')).toBeTruthy();
  });

  it('fires onMenuPress when the menu button is pressed', () => {
    const onMenuPress = jest.fn();
    render(<QueueTabsHeader onMenuPress={onMenuPress} />);
    fireEvent.press(screen.getByLabelText('Open menu'));
    expect(onMenuPress).toHaveBeenCalledTimes(1);
  });

  it('shows the live queue count on the Queue tab', () => {
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('navigates to /conversations when that tab is pressed', () => {
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    fireEvent.press(screen.getByLabelText('Conversations'));
    expect(mockReplace).toHaveBeenCalledWith('/conversations');
  });

  it('navigates to /queue when that tab is pressed from elsewhere', () => {
    mockPathname = '/conversations';
    render(<QueueTabsHeader onMenuPress={() => {}} />);
    fireEvent.press(screen.getByLabelText('Queue'));
    expect(mockReplace).toHaveBeenCalledWith('/queue');
  });
});
