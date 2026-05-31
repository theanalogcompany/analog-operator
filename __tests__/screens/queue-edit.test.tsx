import { ScrollView } from 'react-native';

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import EditScreen from '@/app/queue/edit';
import { type UseQueueResult } from '@/hooks/use-queue';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { clearUndoState, getUndoState } from '@/hooks/use-undo-state';
import {
  type PendingDraft,
  type ThreadMessage,
  PendingDraftSchema,
  editAndSend,
  getThread,
  skipDraft,
} from '@/lib/api/queue';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  params: {} as { messageId?: string; prefill?: string },
};

const mockQueue: UseQueueResult = {
  drafts: [],
  commitments: [],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemoveDraft: jest.fn(),
  restoreDraft: jest.fn(),
  optimisticallyRemoveCommitment: jest.fn(),
  restoreCommitment: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouter.push, back: mockRouter.back }),
  useLocalSearchParams: () => mockRouter.params,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/app/queue/_layout', () => ({
  useQueueContext: () => mockQueue,
}));

jest.mock('@/lib/api/queue', () => {
  const actual = jest.requireActual('@/lib/api/queue');
  return {
    ...actual,
    editAndSend: jest.fn(),
    skipDraft: jest.fn(),
    getThread: jest.fn(),
  };
});

jest.mock('@/hooks/use-thread-realtime', () => ({
  useThreadRealtime: jest.fn(),
}));

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    draftBody: "Yes — patio's open until 9.",
    category: null,
    voiceFidelity: null,
    reviewReason: 'low fidelity',
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [
      {
        id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
        direction: 'inbound',
        body: 'is the patio open',
        createdAt: '2026-05-14T16:00:00.000Z',
      },
    ],
    langfuseTraceId: null,
    ...overrides,
  };
}

beforeEach(async () => {
  mockRouter.push.mockReset();
  mockRouter.back.mockReset();
  (editAndSend as jest.Mock).mockReset();
  (skipDraft as jest.Mock).mockReset();
  (getThread as jest.Mock).mockReset();
  (useThreadRealtime as jest.Mock).mockReset();
  // Default thread fetch: error → screen falls back to recentContext. Most
  // existing tests assert against recentContext rendering, so this preserves
  // them without each one having to wire its own mock.
  (getThread as jest.Mock).mockResolvedValue({
    ok: false,
    error: { kind: 'HTTP', status: 500, message: 'mocked' },
  });
  (mockQueue.optimisticallyRemoveDraft as jest.Mock).mockReset();
  (mockQueue.restoreDraft as jest.Mock).mockReset();
  mockQueue.drafts = [makeDraft()];
  mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
  await clearUndoState();
});

afterEach(async () => {
  await clearUndoState();
});

// Renders EditScreen and awaits the on-mount thread-fetch effect, so the
// subsequent assertions don't trigger act() warnings from the async state
// update that fires after the initial sync render. Existing tests that
// already `await waitFor(...)` on a separate signal handle their own drain.
async function renderAndDrain(): Promise<void> {
  render(<EditScreen />);
  await waitFor(() => expect(getThread).toHaveBeenCalled());
}

describe('EditScreen', () => {
  it('prefills the textarea from agent_draft when no prefill param', async () => {
    await renderAndDrain();
    expect(screen.getByLabelText('Edit the draft before sending').props.value).toBe(
      "Yes — patio's open until 9.",
    );
  });

  it('prefills from the prefill param when present (failure-retry path)', async () => {
    mockRouter.params = {
      messageId: mockQueue.drafts[0].messageId,
      prefill: 'my partially-typed retry attempt',
    };
    await renderAndDrain();
    expect(screen.getByLabelText('Edit the draft before sending').props.value).toBe(
      'my partially-typed retry attempt',
    );
  });

  it('renders the "draft no longer pending" fallback when the draft is gone (queue is ready, draft truly absent)', () => {
    mockQueue.drafts = [];
    mockQueue.status = 'ready';
    render(<EditScreen />);
    // No thread fetch fires here (draft is null, effect early-returns), so
    // no drain needed.
    expect(screen.getByText('That draft is no longer pending.')).toBeTruthy();
    mockQueue.status = 'ready';
  });

  it('renders a loading spinner (NOT "no longer pending") when the draft is missing and the queue is mid-reload (TAC-298 UAT #4)', () => {
    // After swipe-left on a heads-up card, handleDecline fires
    // queue.reload() and navigates immediately — the freshly-created
    // decline draft isn't in queue.drafts yet but the queue is in flight.
    // The edit screen must show a spinner during this brief window
    // instead of the terminal "no longer pending" fallback (which would
    // re-introduce the UAT #3 dead-end symptom).
    mockQueue.drafts = [];
    mockQueue.status = 'loading';
    render(<EditScreen />);
    expect(screen.getByLabelText('Loading draft')).toBeTruthy();
    expect(screen.queryByText('That draft is no longer pending.')).toBeNull();
    mockQueue.status = 'ready';
  });

  it('renders an error fallback with retry when the draft is missing and the queue reload failed', () => {
    // If the background reload after declineDraft fails, the edit screen
    // surfaces the error with a retry button (instead of leaving the
    // spinner spinning forever or showing the misleading "no longer
    // pending" copy).
    mockQueue.drafts = [];
    mockQueue.status = 'error';
    render(<EditScreen />);
    expect(screen.getByText("Couldn't load the draft.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try loading the draft again'));
    expect(mockQueue.reload).toHaveBeenCalled();
    mockQueue.status = 'ready';
  });

  it('on edit failure: clears undo + restores card + re-opens takeover with typed body', async () => {
    (editAndSend as jest.Mock).mockResolvedValue({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'boom' },
    });
    render(<EditScreen />);
    const input = screen.getByLabelText('Edit the draft before sending');
    fireEvent.changeText(input, 'my version of the reply');
    fireEvent.press(screen.getByLabelText('Send my version'));

    await waitFor(() => expect(editAndSend).toHaveBeenCalled());
    expect(editAndSend).toHaveBeenCalledWith(
      mockQueue.drafts[0].messageId,
      'my version of the reply',
    );
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/queue/edit',
      params: {
        messageId: mockQueue.drafts[0].messageId,
        prefill: 'my version of the reply',
      },
    });
    expect(mockQueue.restoreDraft).toHaveBeenCalledWith(mockQueue.drafts[0]);
    // The undo toast must NOT be sticking around after failure.
    expect(getUndoState()).toBeNull();
  });

  it('on skip failure: clears undo + restores card + no retry-takeover push', async () => {
    (skipDraft as jest.Mock).mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });
    render(<EditScreen />);
    fireEvent.press(screen.getByLabelText("Don't send anything"));

    await waitFor(() => expect(skipDraft).toHaveBeenCalled());
    expect(skipDraft).toHaveBeenCalledWith(mockQueue.drafts[0].messageId);
    expect(mockQueue.restoreDraft).toHaveBeenCalledWith(mockQueue.drafts[0]);
    expect(getUndoState()).toBeNull();
    // Skip failure does NOT re-open the takeover (no typed text to preserve).
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('on edit success: leaves the undo state intact for the toast', async () => {
    (editAndSend as jest.Mock).mockResolvedValue({ ok: true, data: undefined });
    render(<EditScreen />);
    fireEvent.changeText(
      screen.getByLabelText('Edit the draft before sending'),
      'shipping this',
    );
    fireEvent.press(screen.getByLabelText('Send my version'));

    await waitFor(() => expect(editAndSend).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(getUndoState()?.action).toBe('edit');
  });

  it('does not call setUndoState until a real send happens (blank body bails)', async () => {
    await renderAndDrain();
    fireEvent.changeText(screen.getByLabelText('Edit the draft before sending'), '   ');
    fireEvent.press(screen.getByLabelText('Send my version'));
    // No need to wait — the early return is synchronous.
    expect(editAndSend).not.toHaveBeenCalled();
    expect(getUndoState()).toBeNull();
  });

  it('renders oldest-first when the upstream server payload was newest-first (parse-boundary sort lock-in)', async () => {
    // Defensive guard for the parse-boundary sort in `lib/api/queue.ts`. The
    // edit screen iterates `draft.recentContext` in array order; on its own
    // it would render whatever order the server provided. The Zod
    // .transform() in PendingDraftSchema flips newest-first → oldest-first
    // at parse time, so the screen renders chronologically. If the
    // transform is ever removed, this test fails. (TAC-280.)
    const newestFirstPayload = {
      messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueSlug: 'mock-sextant',
      guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guestDisplayName: 'Maya R.',
      guestPhoneFallback: '+15551110001',
      draftBody: "Yes — patio's open until 9.",
      category: null,
      voiceFidelity: null,
      reviewReason: null,
      recognitionState: 'returning',
      agentReasoning: null,
      pendingSinceMs: 240_000,
      recentContext: [
        {
          id: '44d7a2f4-5c6b-4d8e-9e9a-1c2d3e4f5a6b',
          direction: 'inbound',
          body: 'latest inbound',
          createdAt: '2026-05-14T16:10:00.000Z',
        },
        {
          id: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
          direction: 'outbound',
          body: 'middle outbound',
          createdAt: '2026-05-14T16:05:00.000Z',
        },
        {
          id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
          direction: 'inbound',
          body: 'first inbound',
          createdAt: '2026-05-14T16:00:00.000Z',
        },
      ],
      langfuseTraceId: null,
    };
    const parsed = PendingDraftSchema.parse(newestFirstPayload);
    mockQueue.drafts = [parsed];
    mockRouter.params = { messageId: parsed.messageId };
    await renderAndDrain();
    const bodies = screen.getAllByText(
      /(first inbound|middle outbound|latest inbound)/,
    );
    expect(bodies.map((n) => n.props.children)).toEqual([
      'first inbound',
      'middle outbound',
      'latest inbound',
    ]);
  });

  it('renders the full chronological recentContext inside the ScrollView (regression guard)', async () => {
    mockQueue.drafts = [
      makeDraft({
        recentContext: [
          {
            id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
            direction: 'inbound',
            body: 'first inbound',
            createdAt: '2026-05-14T16:00:00.000Z',
          },
          {
            id: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
            direction: 'outbound',
            body: 'middle outbound',
            createdAt: '2026-05-14T16:05:00.000Z',
          },
          {
            id: '44d7a2f4-5c6b-4d8e-9e9a-1c2d3e4f5a6b',
            direction: 'inbound',
            body: 'latest inbound',
            createdAt: '2026-05-14T16:10:00.000Z',
          },
        ],
      }),
    ];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    await renderAndDrain();
    expect(screen.getByText('first inbound')).toBeTruthy();
    expect(screen.getByText('middle outbound')).toBeTruthy();
    expect(screen.getByText('latest inbound')).toBeTruthy();
  });

  it('renders agentReasoning outside the ScrollView when non-null', async () => {
    mockQueue.drafts = [
      makeDraft({ agentReasoning: 'lean into the warmth' }),
    ];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    await renderAndDrain();
    const reasoning = screen.getByLabelText('Agent reasoning');
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    let cursor: typeof reasoning.parent | null = reasoning.parent;
    let descendantOfScrollView = false;
    while (cursor) {
      if (cursor === scrollView) {
        descendantOfScrollView = true;
        break;
      }
      cursor = cursor.parent;
    }
    expect(descendantOfScrollView).toBe(false);
    expect(screen.getByText('lean into the warmth')).toBeTruthy();
  });

  it('omits agentReasoning render when null', async () => {
    mockQueue.drafts = [makeDraft({ agentReasoning: null })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    await renderAndDrain();
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });

  it('omits agentReasoning render when empty string (defensive trim)', async () => {
    mockQueue.drafts = [makeDraft({ agentReasoning: '   ' })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    await renderAndDrain();
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });

  it('renders the full thread from getThread on mount (replacing the recentContext loading placeholder)', async () => {
    const fullThread: ThreadMessage[] = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        direction: 'inbound',
        body: 'older history line 1',
        createdAt: '2026-05-14T15:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        direction: 'outbound',
        body: 'older history line 2',
        createdAt: '2026-05-14T15:30:00.000Z',
      },
      {
        id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
        direction: 'inbound',
        body: 'is the patio open',
        createdAt: '2026-05-14T16:00:00.000Z',
      },
    ];
    (getThread as jest.Mock).mockResolvedValue({ ok: true, data: fullThread });

    render(<EditScreen />);
    await waitFor(() => {
      expect(screen.getByText('older history line 1')).toBeTruthy();
    });
    expect(screen.getByText('older history line 2')).toBeTruthy();
    expect(screen.getByText('is the patio open')).toBeTruthy();
  });

  it('falls back to recentContext when getThread returns an error', async () => {
    // Default beforeEach mock is already error — assert the fallback path.
    render(<EditScreen />);
    // recentContext entry from makeDraft is "is the patio open"; should be
    // visible in the loading placeholder AND remain visible after the error
    // resolves (state.kind transitions loading → error, messages preserved).
    expect(screen.getByText('is the patio open')).toBeTruthy();
    // Let the effect resolve and ensure no crash / re-render fails.
    await waitFor(() => {
      expect(getThread).toHaveBeenCalledWith(mockQueue.drafts[0].messageId);
    });
    expect(screen.getByText('is the patio open')).toBeTruthy();
  });

  it('appends a new bubble when useThreadRealtime fires onInsert (and dedupes by id)', async () => {
    (getThread as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        {
          id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
          direction: 'inbound',
          body: 'first',
          createdAt: '2026-05-14T16:00:00.000Z',
        },
      ],
    });
    // Capture onInsert from the hook so we can fire it synthetically.
    let captured: { onInsert: (m: ThreadMessage) => void } | null = null;
    (useThreadRealtime as jest.Mock).mockImplementation((opts) => {
      captured = opts;
    });

    render(<EditScreen />);
    await waitFor(() => {
      expect(screen.getByText('first')).toBeTruthy();
    });

    const newInbound: ThreadMessage = {
      id: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
      direction: 'inbound',
      body: 'live message',
      createdAt: '2026-05-14T16:01:00.000Z',
    };
    act(() => {
      captured!.onInsert(newInbound);
    });
    expect(screen.getByText('live message')).toBeTruthy();

    // Re-fire the same id — should NOT render twice (dedupe).
    act(() => {
      captured!.onInsert(newInbound);
    });
    expect(screen.getAllByText('live message')).toHaveLength(1);
  });
});

