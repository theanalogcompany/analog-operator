import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ThreadScreen from '@/app/conversations/[guestId]';
import { useThreadRealtime, type UseThreadRealtimeOptions } from '@/hooks/use-thread-realtime';
import { type UseConversationsResult } from '@/hooks/use-conversations';
import { type ConversationSummary } from '@/lib/api/conversations';
import { getGuestThread } from '@/lib/api/conversations';
import { type ThreadMessage } from '@/lib/api/queue';

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
jest.mock('@/lib/conversations-context', () => ({
  useConversationsContext: () => mockConversations,
}));
jest.mock('@/hooks/use-thread-realtime', () => ({
  useThreadRealtime: jest.fn(),
}));
jest.mock('@/lib/api/conversations', () => {
  const actual = jest.requireActual('@/lib/api/conversations');
  return { ...actual, getGuestThread: jest.fn() };
});

const mockGetGuestThread = getGuestThread as jest.Mock;
const mockUseThreadRealtime = useThreadRealtime as jest.Mock;

beforeEach(() => {
  mockRouter.back.mockClear();
  mockUseThreadRealtime.mockReset();
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
    expect(screen.getByLabelText('Recognition: Returning')).toBeTruthy();
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

  // Regression coverage for a "Needs fixes" review finding: onInsert/onUpdate
  // were originally passed to useThreadRealtime as bare inline arrow
  // functions, recreated on every render. Since useThreadRealtime's effect
  // depends on [onInsert, onUpdate], a new identity on every message tears
  // down and reopens the Realtime channel — the opposite of what a live
  // thread viewer needs, and a real risk of duplicate delivery. This test
  // asserts the handlers useCallback-memoize to a stable identity across
  // renders, including across a render triggered by an actual message
  // arrival.
  it('passes the same onInsert/onUpdate identity to useThreadRealtime across renders', async () => {
    const captured: UseThreadRealtimeOptions[] = [];
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      captured.push(opts);
    });

    render(<ThreadScreen />);
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());

    expect(captured.length).toBeGreaterThan(1);
    const beforeInsert = captured[captured.length - 1];

    act(() => {
      beforeInsert.onInsert({
        id: '3',
        direction: 'inbound',
        body: 'One more thing — can we push to 8?',
        createdAt: new Date().toISOString(),
      });
    });

    const afterInsert = captured[captured.length - 1];
    expect(afterInsert.onInsert).toBe(beforeInsert.onInsert);
    expect(afterInsert.onUpdate).toBe(beforeInsert.onUpdate);
  });

  it('merges a duplicate realtime insert into a single bubble instead of duplicating it', async () => {
    let captured: UseThreadRealtimeOptions | null = null;
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      captured = opts;
    });

    render(<ThreadScreen />);
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());

    const live: ThreadMessage = {
      id: '3',
      direction: 'inbound',
      body: 'Table for two works great, see you then!',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    };
    act(() => {
      captured!.onInsert(live);
    });
    expect(screen.getByText('Table for two works great, see you then!')).toBeTruthy();

    // Re-fire the identical message (simulating a duplicate Realtime
    // delivery) — mergeMessage replaces-by-id, so this must NOT render a
    // second bubble.
    act(() => {
      captured!.onInsert(live);
    });
    expect(screen.getAllByText('Table for two works great, see you then!')).toHaveLength(1);
  });

  // Regression coverage for a final-review finding: on fetch failure with no
  // other messages cached for this guest, the screen used to render
  // `threadState.messages` (`[]`) directly with no branch on `kind`,
  // producing a blank thread area with zero indication anything went wrong.
  // Per the design spec's Error Handling section, a guest-thread fetch
  // failure must fall back to a single synthetic bubble built from the
  // guest summary's last-message preview rather than showing a blank screen.
  it('falls back to the guest summary preview as a single bubble when the thread fetch fails', async () => {
    mockGetGuestThread.mockReset();
    mockGetGuestThread.mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });

    render(<ThreadScreen />);

    await waitFor(() =>
      expect(screen.getByText('Done — got you down for two at 7:30.')).toBeTruthy(),
    );
  });

  it('reconciles a realtime message that arrives while the fetch is still in flight', async () => {
    let captured: UseThreadRealtimeOptions | null = null;
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      captured = opts;
    });
    // Delay the fetch resolution so we can fire a realtime insert first.
    let resolveFetch: (value: { ok: true; data: ThreadMessage[] }) => void = () => {};
    mockGetGuestThread.mockReset();
    mockGetGuestThread.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<ThreadScreen />);

    const live: ThreadMessage = {
      id: 'live-1',
      direction: 'inbound',
      body: 'Arrived before the fetch resolved',
      createdAt: new Date(Date.now() - 30_000).toISOString(),
    };
    act(() => {
      captured!.onInsert(live);
    });
    expect(screen.getByText('Arrived before the fetch resolved')).toBeTruthy();

    await act(async () => {
      resolveFetch({
        ok: true,
        data: [
          {
            id: '1',
            direction: 'inbound',
            body: 'Hi! Is the patio open tonight?',
            createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          },
        ],
      });
      await Promise.resolve();
    });

    // The live arrival must survive the fetch resolving — it should not be
    // silently dropped by a wholesale overwrite of threadState.
    expect(screen.getByText('Arrived before the fetch resolved')).toBeTruthy();
    expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy();
  });
});
