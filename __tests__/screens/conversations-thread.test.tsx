import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ThreadScreen from '@/app/conversations/[guestId]';
import { type UseConversationsResult } from '@/hooks/use-conversations';
import { type ConversationSummary } from '@/lib/api/conversations';
import { getGuestThread } from '@/lib/api/conversations';

const GUEST: ConversationSummary = {
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

const mockRouter = { back: jest.fn() };
const mockParams = { guestId: 'g1' };

let mockConversations: UseConversationsResult = {
  conversations: [GUEST],
  status: 'ready',
  error: null,
  reload: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/hooks/use-conversations', () => ({
  useConversations: () => mockConversations,
}));
jest.mock('@/hooks/use-thread-realtime', () => ({
  useThreadRealtime: () => undefined,
}));
jest.mock('@/lib/api/conversations', () => {
  const actual = jest.requireActual('@/lib/api/conversations');
  return { ...actual, getGuestThread: jest.fn() };
});

const mockGetGuestThread = getGuestThread as jest.Mock;

beforeEach(() => {
  mockRouter.back.mockClear();
  mockGetGuestThread.mockReset();
  mockGetGuestThread.mockResolvedValue({
    ok: true,
    data: [
      {
        id: '1',
        direction: 'inbound',
        body: 'Hi! Is the patio open tonight?',
        createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
      {
        id: '2',
        direction: 'outbound',
        body: 'Done — got you down for two at 7:30.',
        createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      },
    ],
  });
});

describe('ConversationThreadScreen', () => {
  it('renders the guest name, badge, and meta line', async () => {
    render(<ThreadScreen />);
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Returning')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/4 conversations since/)).toBeTruthy());
  });

  it('fetches and renders the thread', async () => {
    render(<ThreadScreen />);
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());
    expect(screen.getByText('Done — got you down for two at 7:30.')).toBeTruthy();
  });

  it('renders the agent-handling footer note with the real agent name', async () => {
    render(<ThreadScreen />);
    // Note: the JSX footer text uses `&rsquo;` (renders as a curly ’), not a
    // plain ASCII apostrophe — match what actually renders, not what's easy
    // to type.
    await waitFor(() =>
      expect(
        screen.getByText(/Sana is handling this one\. You’ll see it in the queue if it needs your input\./),
      ).toBeTruthy(),
    );
  });

  it('does not render any compose input or send button', async () => {
    render(<ThreadScreen />);
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());
    expect(screen.queryByLabelText(/send/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/type/i)).toBeNull();
  });

  it('navigates back when the back chevron is pressed', () => {
    render(<ThreadScreen />);
    fireEvent.press(screen.getByLabelText('Back to conversations'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
