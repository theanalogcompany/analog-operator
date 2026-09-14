import { fireEvent, render, screen } from '@testing-library/react-native';
import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

// These screens sit on a GroundScreen, which supplies the safe area.
const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
function withSafeArea(ui: React.ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
}

describe('ConversationsScreen', () => {
  it('renders the headline and both rows', () => {
    render(withSafeArea(<ConversationsScreen />));
    expect(screen.getByText('Everything happening.')).toBeTruthy();
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    expect(screen.getByText('BEN A.')).toBeTruthy();
  });

  it('shows the active/total counts', () => {
    render(withSafeArea(<ConversationsScreen />));
    // 1 active (within 60 min), 2 total. The redesign renders this as one
    // tracked-caps meta line rather than five separate Text nodes, so the
    // assertion is the whole line — which also pins the design's format.
    expect(screen.getByText('1 ACTIVE NOW · 2 OPEN')).toBeTruthy();
    expect(screen.getByLabelText('1 active now · 2 open')).toBeTruthy();
  });

  it('navigates to the guest thread when a row is pressed', () => {
    render(withSafeArea(<ConversationsScreen />));
    fireEvent.press(screen.getByLabelText('Open conversation with Maya R.'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/conversations/[guestId]',
      params: { guestId: 'g1' },
    });
  });

  it('filters to only active conversations when the Active pill is pressed', () => {
    render(withSafeArea(<ConversationsScreen />));
    fireEvent.press(screen.getByLabelText('Active'));
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    expect(screen.queryByText('BEN A.')).toBeNull();
  });

  it('filters by guest type via the dropdown', () => {
    render(withSafeArea(<ConversationsScreen />));
    fireEvent.press(screen.getByLabelText(/All guests/));
    fireEvent.press(screen.getByLabelText('New'));
    expect(screen.queryByText('MAYA R.')).toBeNull();
    expect(screen.getByText('BEN A.')).toBeTruthy();
  });

  it('shows the conversations empty state when the filter matches nothing', () => {
    render(withSafeArea(<ConversationsScreen />));
    fireEvent.press(screen.getByLabelText(/All guests/));
    fireEvent.press(screen.getByLabelText('Raving Fan'));
    expect(screen.getByText('Nothing here right now.')).toBeTruthy();
  });

  it('shows a loading indicator while status is loading', () => {
    mockConversations = { ...mockConversations, status: 'loading' };
    render(withSafeArea(<ConversationsScreen />));
    expect(screen.queryByText('Everything happening.')).toBeNull();
  });

  it('shows a retry affordance on error', () => {
    mockConversations = { ...mockConversations, status: 'error', error: { kind: 'NETWORK' } as any };
    render(withSafeArea(<ConversationsScreen />));
    expect(screen.getByLabelText('Retry loading conversations')).toBeTruthy();
  });
});
