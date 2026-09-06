import { fireEvent, render, screen } from '@testing-library/react-native';

import ConversationsScreen from '@/app/conversations/index';
import { type UseConversationsResult } from '@/hooks/use-conversations';
import { type ConversationSummary } from '@/lib/api/conversations';

const ACTIVE: ConversationSummary = {
  guestId: 'g1',
  venueId: 'v1',
  venueSlug: 'mock-sextant',
  venueTimezone: 'America/Los_Angeles',
  agentName: 'Sana',
  name: 'Maya R.',
  phoneFallback: '+15551110001',
  recognitionState: 'returning',
  lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Done — got you down for two at 7:30.',
  conversationCount: 4,
  firstConversationAt: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString(),
};

const QUIET_NEW: ConversationSummary = {
  ...ACTIVE,
  guestId: 'g2',
  name: 'Ben A.',
  phoneFallback: '+15551110033',
  recognitionState: 'new',
  lastMessageAt: new Date(Date.now() - 2900 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Dogs are very welcome on the patio.',
  conversationCount: 1,
};

let mockConversations: UseConversationsResult = {
  conversations: [ACTIVE, QUIET_NEW],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
};

// `replace` is included even though this file's own tests don't press the
// header's tab buttons — QueueTabsHeader (rendered by this screen) calls
// router.replace() from its own handlers, and leaving it undefined would
// throw the moment any test does exercise that path.
const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/conversations',
}));
jest.mock('@/lib/conversations-context', () => ({
  useConversationsContext: () => mockConversations,
}));
jest.mock('@/lib/queue-context', () => ({
  useQueueContext: () => ({ drafts: [], status: 'ready', error: null, reload: jest.fn(), optimisticallyRemove: jest.fn(), restore: jest.fn() }),
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

beforeEach(() => {
  mockRouter.push.mockClear();
  mockConversations = {
    conversations: [ACTIVE, QUIET_NEW],
    status: 'ready',
    error: null,
    reload: jest.fn().mockResolvedValue(undefined),
  };
});

describe('ConversationsScreen', () => {
  it('renders the headline and both rows', () => {
    render(<ConversationsScreen />);
    expect(screen.getByText('Everything happening.')).toBeTruthy();
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Ben A.')).toBeTruthy();
  });

  it('shows the active/total counts', () => {
    render(<ConversationsScreen />);
    // 1 active (within 60 min), 2 total.
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('navigates to the guest thread when a row is pressed', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText('Open conversation with Maya R.'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/conversations/[guestId]',
      params: { guestId: 'g1' },
    });
  });

  it('filters to only active conversations when the Active pill is pressed', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText('Active'));
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.queryByText('Ben A.')).toBeNull();
  });

  it('filters by guest type via the dropdown', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText(/All guests/));
    fireEvent.press(screen.getByLabelText('New'));
    expect(screen.queryByText('Maya R.')).toBeNull();
    expect(screen.getByText('Ben A.')).toBeTruthy();
  });

  it('shows the conversations empty state when the filter matches nothing', () => {
    render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText(/All guests/));
    fireEvent.press(screen.getByLabelText('Raving Fan'));
    expect(screen.getByText('Nothing here right now.')).toBeTruthy();
  });

  it('shows a loading indicator while status is loading', () => {
    mockConversations = { ...mockConversations, status: 'loading' };
    render(<ConversationsScreen />);
    expect(screen.queryByText('Everything happening.')).toBeNull();
  });

  it('shows a retry affordance on error', () => {
    mockConversations = { ...mockConversations, status: 'error', error: { kind: 'NETWORK' } as any };
    render(<ConversationsScreen />);
    expect(screen.getByLabelText('Retry loading conversations')).toBeTruthy();
  });
});
