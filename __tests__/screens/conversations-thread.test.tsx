import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
  // Reset here, not at the end of the test that reassigns it: an early
  // failure there would otherwise leak the wrong guest into the next tests
  // and make them fail for a reason that has nothing to do with them.
  mockConversations = {
    conversations: [GUEST],
    status: 'ready',
    error: null,
    reload: jest.fn(),
  };
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

// These screens sit on a GroundScreen, which supplies the safe area.
const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
function withSafeArea(ui: React.ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
}

describe('ConversationThreadScreen', () => {
  it('renders the guest name, badge, and meta line', async () => {
    render(withSafeArea(<ThreadScreen />));
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    expect(screen.getByLabelText('Recognition: Returning')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/4 conversations since/)).toBeTruthy());
  });

  it('fetches and renders the thread', async () => {
    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());
    expect(screen.getByText('Done — got you down for two at 7:30.')).toBeTruthy();
  });

  it('renders the agent-handling footer note with the real agent name', async () => {
    render(withSafeArea(<ThreadScreen />));
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
    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());
    expect(screen.queryByLabelText(/send/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/type/i)).toBeNull();
  });

  it('navigates back when the back chevron is pressed', () => {
    render(withSafeArea(<ThreadScreen />));
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

    render(withSafeArea(<ThreadScreen />));
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

    render(withSafeArea(<ThreadScreen />));
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

    render(withSafeArea(<ThreadScreen />));

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

    render(withSafeArea(<ThreadScreen />));

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

// ---------------------------------------------------------------------------
// TAC-411 — a row that stops counting leaves an open thread without the
// screen being reopened, and an empty preview builds no bubble.
// ---------------------------------------------------------------------------
describe('ConversationThreadScreen — live removals (TAC-411)', () => {
  it('drops a message from the open thread when the channel removes its id', async () => {
    let captured: UseThreadRealtimeOptions | null = null;
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      captured = opts;
    });

    render(withSafeArea(<ThreadScreen />));
    await waitFor(() =>
      expect(screen.getByText('Done — got you down for two at 7:30.')).toBeTruthy(),
    );

    // The channel decided this row no longer counts — a late Sendblue ERROR
    // moved it to `failed`, or it was regenerated back into `pending`.
    act(() => {
      captured!.onRemove('2');
    });

    expect(screen.queryByText('Done — got you down for two at 7:30.')).toBeNull();
    // The rest of the thread is untouched.
    expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy();
  });

  it('ignores a removal for an id the thread never held', async () => {
    let captured: UseThreadRealtimeOptions | null = null;
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      captured = opts;
    });

    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());

    act(() => {
      captured!.onRemove('a-draft-that-was-never-shown');
    });

    expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy();
    expect(screen.getByText('Done — got you down for two at 7:30.')).toBeTruthy();
  });

  it('never shows a pending draft that arrives while the thread is open', async () => {
    // The channel applies the Contract's condition, so a pending draft reaches
    // the screen as a removal, never as an insert. This pins that the screen
    // does not render one by some other route.
    let captured: UseThreadRealtimeOptions | null = null;
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      captured = opts;
    });

    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());

    act(() => {
      captured!.onRemove('pending-draft-id');
    });

    expect(screen.queryByText(/on the house/)).toBeNull();
  });
});

describe('ConversationThreadScreen — empty preview (TAC-411)', () => {
  const EMPTY_PREVIEW_GUEST: ConversationSummary = {
    ...GUEST,
    lastMessagePreview: '',
  };

  it('builds no fallback bubble when the fetch fails and the preview is empty', async () => {
    mockConversations = {
      conversations: [EMPTY_PREVIEW_GUEST],
      status: 'ready',
      error: null,
      reload: jest.fn(),
    };
    mockGetGuestThread.mockReset();
    mockGetGuestThread.mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });

    render(withSafeArea(<ThreadScreen />));

    await waitFor(() =>
      expect(screen.getByText('Nothing has reached this guest yet.')).toBeTruthy(),
    );
    // The bubble the old fallback would have built carried the guest's
    // direction and an empty body — a message nobody received.
    expect(screen.queryByText('Done — got you down for two at 7:30.')).toBeNull();
  });

  it('does NOT back the line, because this surface sits on clay', async () => {
    // Clay clears 3:1 unbacked, so no pill — the same call the date dividers
    // make for `surface="thread"`. (SR-1; see ground-contrast.)
    mockGetGuestThread.mockReset();
    mockGetGuestThread.mockResolvedValue({ ok: true, data: [] });

    render(withSafeArea(<ThreadScreen />));

    await waitFor(() =>
      expect(screen.getByText('Nothing has reached this guest yet.')).toBeTruthy(),
    );
    expect(screen.queryByTestId('empty-state-backing')).toBeNull();
  });

  it('shows the same empty state when the fetch SUCCEEDS with no messages', async () => {
    // After TAC-395 the server returns { "messages": [] } for a guest whose
    // only messages are unsent drafts, so success and failure land together.
    mockGetGuestThread.mockReset();
    mockGetGuestThread.mockResolvedValue({ ok: true, data: [] });

    render(withSafeArea(<ThreadScreen />));

    await waitFor(() =>
      expect(screen.getByText('Nothing has reached this guest yet.')).toBeTruthy(),
    );
  });

  it('withholds the claim while the fetch is still out', async () => {
    // Same gate as the edit takeover: the empty state is a claim about the
    // guest, and an unresolved fetch has not established it.
    mockConversations = {
      conversations: [EMPTY_PREVIEW_GUEST],
      status: 'ready',
      error: null,
      reload: jest.fn(),
    };
    mockGetGuestThread.mockReset();
    mockGetGuestThread.mockReturnValue(new Promise(() => {}));

    render(withSafeArea(<ThreadScreen />));

    // Header is up, so the screen rendered; the thread area stays silent.
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    expect(screen.queryByText('Nothing has reached this guest yet.')).toBeNull();
  });

  it('still builds the fallback bubble when the preview is NOT empty', async () => {
    // The design spec's "must not show a blank screen on fetch failure" still
    // holds for every guest who has a counting message.
    mockGetGuestThread.mockReset();
    mockGetGuestThread.mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });

    render(withSafeArea(<ThreadScreen />));

    await waitFor(() =>
      expect(screen.getByText('Done — got you down for two at 7:30.')).toBeTruthy(),
    );
    expect(screen.queryByText('Nothing has reached this guest yet.')).toBeNull();
  });
});
