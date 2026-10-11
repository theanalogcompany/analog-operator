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
  guestChannel: 'text',
  replyWindowExpiresAt: null,
  instagramUsername: null,
  recognitionState: 'returning',
  lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Done — got you down for two at 7:30.',
  previewLabel: null,
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
    previewLabel: null,
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

/**
 * Media on the Conversations thread. (TAC-583.)
 *
 * `useThreadRealtime` is mocked, so these claim what the SCREEN does when the
 * channel asks for a refetch or a tile reports an expired url. That the channel
 * asks on INSERT and UPDATE is pinned where it lives, in
 * __tests__/lib/realtime-thread-channel.test.ts.
 */
describe('ConversationThreadScreen — media (TAC-583)', () => {
  const SENT = '2026-10-11T17:12:33.000Z';
  const photo = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    kind: 'image',
    status: 'ready',
    url: 'https://project.supabase.co/storage/v1/object/sign/guest-media/a1',
    urlExpiresAt: '2026-10-11T18:12:33.000Z',
    mimeType: 'image/jpeg',
    title: null,
    linkUrl: null,
    ...overrides,
  });
  const photoMessage = (attachment: Record<string, unknown>) => ({
    id: 'p',
    direction: 'inbound',
    body: '',
    createdAt: SENT,
    unsupported: false,
    attachments: [attachment],
  });

  function captureRealtime() {
    const box: { opts: UseThreadRealtimeOptions | null } = { opts: null };
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      box.opts = opts;
    });
    return box;
  }

  it('draws a media-only thread as media, not as the empty state', async () => {
    mockGetGuestThread.mockResolvedValue({ ok: true, data: [photoMessage(photo())] });
    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByTestId('media-image')).toBeTruthy());
    expect(screen.queryByText('Nothing has reached this guest yet.')).toBeNull();
  });

  it('fetches the thread again when the channel says a media row changed, and shows the result', async () => {
    const realtime = captureRealtime();
    // First: re-hosting has not settled. Then: it has.
    mockGetGuestThread
      .mockResolvedValueOnce({
        ok: true,
        data: [photoMessage(photo({ status: 'pending', url: null, urlExpiresAt: null }))],
      })
      .mockResolvedValueOnce({ ok: true, data: [photoMessage(photo())] });

    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
    expect(screen.queryByTestId('media-image')).toBeNull();

    act(() => {
      realtime.opts!.onRefetch();
    });

    await waitFor(() => expect(screen.getByTestId('media-image')).toBeTruthy());
    expect(mockGetGuestThread).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('keeps the thread on screen when a refetch fails', async () => {
    const realtime = captureRealtime();
    mockGetGuestThread
      .mockResolvedValueOnce({ ok: true, data: [photoMessage(photo())] })
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'HTTP', status: 500, message: 'mocked' },
      });

    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByTestId('media-image')).toBeTruthy());

    await act(async () => {
      realtime.opts!.onRefetch();
    });

    await waitFor(() => expect(mockGetGuestThread).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('media-image')).toBeTruthy();
  });

  it('does not bring back a message the refetch no longer returns', async () => {
    const realtime = captureRealtime();
    mockGetGuestThread
      .mockResolvedValueOnce({
        ok: true,
        data: [
          { id: '1', direction: 'inbound', body: 'still here', createdAt: SENT },
          { id: '2', direction: 'outbound', body: 'since removed', createdAt: SENT },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [{ id: '1', direction: 'inbound', body: 'still here', createdAt: SENT }],
      });

    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText('since removed')).toBeTruthy());

    act(() => {
      realtime.opts!.onRefetch();
    });

    await waitFor(() => expect(screen.queryByText('since removed')).toBeNull());
    expect(screen.getByText('still here')).toBeTruthy();
  });

  it('passes the same onRefetch identity across renders, so the channel is not reopened', async () => {
    const seen: (() => void)[] = [];
    mockUseThreadRealtime.mockImplementation((opts: UseThreadRealtimeOptions) => {
      seen.push(opts.onRefetch);
    });
    render(withSafeArea(<ThreadScreen />));
    await waitFor(() => expect(screen.getByText('Hi! Is the patio open tonight?')).toBeTruthy());
    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(1);
  });

  // "On a load error past `urlExpiresAt`, refetch once."
  describe('a photo whose signed url has run out', () => {
    // Long past by the real clock, so no fake timers are needed.
    const STALE = '2020-01-01T00:00:00.000Z';

    it('refetches once, and only once however many times that photo fails', async () => {
      // The refetch hands back a new url for the same attachment, which
      // remounts the tile. It then fails again, still past its expiry. Without
      // the once-per-attachment memory this would refetch for ever.
      mockGetGuestThread
        .mockResolvedValueOnce({
          ok: true,
          data: [photoMessage(photo({ url: 'https://project.supabase.co/first', urlExpiresAt: STALE }))],
        })
        .mockResolvedValue({
          ok: true,
          data: [photoMessage(photo({ url: 'https://project.supabase.co/second', urlExpiresAt: STALE }))],
        });

      render(withSafeArea(<ThreadScreen />));
      await waitFor(() =>
        expect(screen.getByTestId('media-image').props.source.uri).toBe(
          'https://project.supabase.co/first',
        ),
      );
      expect(mockGetGuestThread).toHaveBeenCalledTimes(1);

      fireEvent(screen.getByTestId('media-image'), 'error', {});
      await waitFor(() =>
        expect(screen.getByTestId('media-image').props.source.uri).toBe(
          'https://project.supabase.co/second',
        ),
      );
      expect(mockGetGuestThread).toHaveBeenCalledTimes(2);

      fireEvent(screen.getByTestId('media-image'), 'error', {});
      await waitFor(() => expect(screen.getByText("Couldn't load")).toBeTruthy());
      expect(mockGetGuestThread).toHaveBeenCalledTimes(2);
    });

    it('does not refetch for a photo that fails while its url is still good', async () => {
      mockGetGuestThread.mockResolvedValue({
        ok: true,
        data: [photoMessage(photo({ urlExpiresAt: '2999-01-01T00:00:00.000Z' }))],
      });
      render(withSafeArea(<ThreadScreen />));
      await waitFor(() => expect(screen.getByTestId('media-image')).toBeTruthy());

      fireEvent(screen.getByTestId('media-image'), 'error', {});
      await waitFor(() => expect(screen.getByText("Couldn't load")).toBeTruthy());
      expect(mockGetGuestThread).toHaveBeenCalledTimes(1);
    });
  });

  describe('the fetch-failure fallback', () => {
    const failed = () =>
      mockGetGuestThread.mockResolvedValue({
        ok: false,
        error: { kind: 'HTTP', status: 500, message: 'mocked' },
      });

    it('stands the list\'s label in for a media last message, instead of claiming nothing happened', async () => {
      mockConversations = {
        conversations: [{ ...GUEST, lastMessagePreview: '', previewLabel: 'Photo' }],
        status: 'ready',
        error: null,
        reload: jest.fn(),
      };
      failed();
      render(withSafeArea(<ThreadScreen />));
      await waitFor(() => expect(screen.getByText('Photo')).toBeTruthy());
      expect(screen.queryByText('Nothing has reached this guest yet.')).toBeNull();
    });

    it('still claims it when the preview and the label are both empty (TAC-411)', async () => {
      mockConversations = {
        conversations: [{ ...GUEST, lastMessagePreview: '', previewLabel: null }],
        status: 'ready',
        error: null,
        reload: jest.fn(),
      };
      failed();
      render(withSafeArea(<ThreadScreen />));
      await waitFor(() =>
        expect(screen.getByText('Nothing has reached this guest yet.')).toBeTruthy(),
      );
    });
  });
});
