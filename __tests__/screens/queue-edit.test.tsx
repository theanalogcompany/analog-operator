import { type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';

import EditScreen from '@/app/queue/edit';
import { QueueCard } from '@/components/queue/queue-card';
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
import {
  __resetDeclineHandoffForTests,
  peekDeclineHandoff,
  stageDeclineHandoff,
} from '@/lib/decline-handoff';
import { card, takeoverHeader } from '@/lib/theme';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  params: {} as { messageId?: string; prefill?: string; bucket?: string },
};

const mockQueue: UseQueueResult = {
  drafts: [],
  commitments: [],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
  optimisticallyRemoveCommitment: jest.fn(),
  restoreCommitment: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouter.push, back: mockRouter.back }),
  useLocalSearchParams: () => mockRouter.params,
}));

// Mutable, so a test can put the takeover under a real status bar. (TAC-388.)
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => mockInsets,
  };
});

jest.mock('@/lib/queue-context', () => ({
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

// Captures the takeover's ground DECISION. How a ground paints belongs to
// lib/grounds.ts and its own tests.
const mockGround: { name: string | null; edges: readonly string[] | undefined } = {
  name: null,
  edges: undefined,
};
jest.mock('@/components/ground/ground-screen', () => {
  const { View } = jest.requireActual('react-native');
  return {
    GroundScreen: ({
      name,
      edges,
      children,
    }: {
      name: string;
      edges?: readonly string[];
      children: ReactNode;
    }) => {
      mockGround.name = name;
      mockGround.edges = edges;
      return <View>{children}</View>;
    },
  };
});

// The pinned header's backing paints a named ground; this records which.
jest.mock('@/components/ground/ground', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Ground: ({ name }: { name: string }) => <View testID={`ground-${name}`} />,
  };
});

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    replyingTo: null,
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
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    ...overrides,
  };
}

beforeEach(async () => {
  mockInsets.top = 0;
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
  (mockQueue.optimisticallyRemove as jest.Mock).mockReset();
  (mockQueue.restore as jest.Mock).mockReset();
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

  it('renders the "draft no longer pending" fallback when the draft is gone', () => {
    mockQueue.drafts = [];
    render(<EditScreen />);
    // No thread fetch fires here (draft is null, effect early-returns), so
    // no drain needed.
    expect(screen.getByText('That draft is no longer pending.')).toBeTruthy();
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
        bucket: 'midThread',
      },
    });
    expect(mockQueue.restore).toHaveBeenCalledWith(mockQueue.drafts[0]);
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
    expect(mockQueue.restore).toHaveBeenCalledWith(mockQueue.drafts[0]);
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
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      replacedDraft: null,
      replyingTo: null,
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
      reviewReasonCode: '',
      reviewTriggers: [],
      reviewTriggerLabels: [],
      ungroundedClaims: [],
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

  // The card and the takeover have to name the same message the same way —
  // the defect was one screen calling a 9:39 AM message "night". Both
  // components are real here: the claim is about what each renders, so mocking
  // either would prove nothing about the pair. `venueTimezone` is null, so
  // both read the device's zone; TAC-414 is what makes them agree when the
  // venue's zone differs. (TAC-408.)
  it('renders the same day separator as the queue card, for the same message', async () => {
    const DIVIDER = / · \d{1,2}:\d{2}\s?(AM|PM)$/;
    // Local date parts, so the label is the same in any runner's zone. Sep 10
    // 2026 is far enough back to read as a named day rather than "Today".
    const message: ThreadMessage = {
      id: '00000000-0000-4000-8000-00000000000a',
      direction: 'inbound',
      body: 'is the patio open',
      createdAt: new Date(2026, 8, 10, 9, 39).toISOString(),
    };
    const draft = makeDraft({ recentContext: [message], venueTimezone: null });
    mockQueue.drafts = [draft];
    mockRouter.params = { messageId: draft.messageId };
    (getThread as jest.Mock).mockResolvedValue({ ok: true, data: [message] });

    await renderAndDrain();
    const onTakeover = screen.getByText(DIVIDER).props.children;

    const asCard = render(<QueueCard draft={draft} height={card.heightPx} />);
    const onCard = asCard.getByText(DIVIDER).props.children;

    expect(onTakeover).toBe(onCard);
    expect(onCard).toBe('THU SEP 10 · 9:39 AM');
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

  // TAC-411. The reported defect: with this screen open, the guest texts
  // again, the agent regenerates the pending draft in place, and the UPDATE
  // put it in the thread above the composer looking sent. The channel now
  // resolves such a row to a removal; this is the screen honouring it without
  // being reopened.
  it('drops a bubble when useThreadRealtime fires onRemove', async () => {
    (getThread as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        {
          id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
          direction: 'inbound',
          body: 'the guest asked something',
          createdAt: '2026-05-14T16:00:00.000Z',
        },
        {
          id: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
          direction: 'outbound',
          body: 'a reply that later stopped counting',
          createdAt: '2026-05-14T16:01:00.000Z',
        },
      ],
    });
    let captured: { onRemove: (id: string) => void } | null = null;
    (useThreadRealtime as jest.Mock).mockImplementation((opts) => {
      captured = opts;
    });

    render(<EditScreen />);
    await waitFor(() => {
      expect(screen.getByText('a reply that later stopped counting')).toBeTruthy();
    });

    act(() => {
      captured!.onRemove('33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a');
    });

    expect(screen.queryByText('a reply that later stopped counting')).toBeNull();
    expect(screen.getByText('the guest asked something')).toBeTruthy();
  });

  it('leaves the thread alone when onRemove names an id it never held', async () => {
    (getThread as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        {
          id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
          direction: 'inbound',
          body: 'the guest asked something',
          createdAt: '2026-05-14T16:00:00.000Z',
        },
      ],
    });
    let captured: { onRemove: (id: string) => void } | null = null;
    (useThreadRealtime as jest.Mock).mockImplementation((opts) => {
      captured = opts;
    });

    render(<EditScreen />);
    await waitFor(() => {
      expect(screen.getByText('the guest asked something')).toBeTruthy();
    });

    // A pending draft for this guest that was never rendered — including the
    // guest's OTHER pending card (TAC-394). Nothing to remove, nothing breaks.
    act(() => {
      captured!.onRemove('44d7a2f4-5c6b-4d8e-9a0f-1c2d3e4f5a6b');
    });

    expect(screen.getByText('the guest asked something')).toBeTruthy();
  });
});


// TAC-310. The reported failure ran through a draft whose body was blank: the
// agent never generated one, the card rendered an empty bubble, and every send
// attempt shipped nothing. These cover the recovery path end-to-end at the
// screen boundary — blank draft in, operator's typed words out.
describe('EditScreen — blank draft body (TAC-310)', () => {
  beforeEach(() => {
    mockQueue.drafts = [makeDraft({ draftBody: '' })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
  });

  it('opens the composer empty rather than seeding it with the blank body', async () => {
    await renderAndDrain();
    expect(screen.getByLabelText('Edit the draft before sending').props.value).toBe('');
  });

  it('uses the Contract placeholder — there is no message to "edit" here', async () => {
    await renderAndDrain();
    expect(screen.getByLabelText('Edit the draft before sending').props.placeholder).toBe(
      'Type your answer to send to the guest',
    );
  });

  it('sends the operator\'s typed text, not the blank draft body', async () => {
    (editAndSend as jest.Mock).mockResolvedValue({ ok: true, data: undefined });
    const typed = "Found it — denim jacket's behind the bar, come grab it anytime.";
    render(<EditScreen />);
    fireEvent.changeText(screen.getByLabelText('Edit the draft before sending'), typed);
    fireEvent.press(screen.getByLabelText('Send my version'));

    await waitFor(() => expect(editAndSend).toHaveBeenCalled());
    expect(editAndSend).toHaveBeenCalledWith(mockQueue.drafts[0].messageId, typed);
  });

  it('trims surrounding whitespace off the typed text before sending', async () => {
    (editAndSend as jest.Mock).mockResolvedValue({ ok: true, data: undefined });
    render(<EditScreen />);
    fireEvent.changeText(
      screen.getByLabelText('Edit the draft before sending'),
      '  behind the bar  ',
    );
    fireEvent.press(screen.getByLabelText('Send my version'));

    await waitFor(() => expect(editAndSend).toHaveBeenCalled());
    expect(editAndSend).toHaveBeenCalledWith(
      mockQueue.drafts[0].messageId,
      'behind the bar',
    );
  });

  it('blocks send while the composer is still empty', async () => {
    await renderAndDrain();
    fireEvent.press(screen.getByLabelText('Send my version'));
    await waitFor(() => expect(getThread).toHaveBeenCalled());
    expect(editAndSend).not.toHaveBeenCalled();
    expect(mockQueue.optimisticallyRemove).not.toHaveBeenCalled();
  });
});

// The other half of the placeholder split: a card that DID carry a draft keeps
// "Edit the message…", because that sentence is accurate there. Keyed on the
// draft, not on the composer's current emptiness — clearing a real draft is
// still editing a message that exists. (TAC-310.)
describe('EditScreen — composer placeholder on a normal draft', () => {
  it('says "Edit the message…" when the draft carried real text', async () => {
    render(<EditScreen />);
    await waitFor(() => expect(getThread).toHaveBeenCalled());
    expect(screen.getByLabelText('Edit the draft before sending').props.placeholder).toBe(
      'Edit the message…',
    );
  });

  it('keeps "Edit the message…" after the operator clears the field', async () => {
    render(<EditScreen />);
    await waitFor(() => expect(getThread).toHaveBeenCalled());
    const input = screen.getByLabelText('Edit the draft before sending');
    fireEvent.changeText(input, '');
    expect(
      screen.getByLabelText('Edit the draft before sending').props.placeholder,
    ).toBe('Edit the message…');
  });
});

// TAC-364. A decline draft is created server-side a moment before this screen
// opens, so the cached queue cannot hold it on first paint.
describe('EditScreen — decline handoff (TAC-364)', () => {
  const DECLINE_ID = '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f';
  const BODY = "So sorry, we can't do the cortado today after all.";

  afterEach(() => {
    __resetDeclineHandoffForTests();
  });

  it('renders the staged decline draft on first paint, not "no longer pending"', () => {
    mockQueue.drafts = [];
    stageDeclineHandoff(makeDraft({ messageId: DECLINE_ID, draftBody: BODY }));
    mockRouter.params = { messageId: DECLINE_ID, prefill: BODY };
    render(<EditScreen />);
    expect(screen.queryByText('That draft is no longer pending.')).toBeNull();
    expect(screen.getByDisplayValue(BODY)).toBeTruthy();
  });

  it('sends the decline through editAndSend, as the draft the server created', async () => {
    (editAndSend as jest.Mock).mockResolvedValue({ ok: true, data: undefined });
    mockQueue.drafts = [];
    stageDeclineHandoff(makeDraft({ messageId: DECLINE_ID, draftBody: BODY }));
    mockRouter.params = { messageId: DECLINE_ID, prefill: BODY };
    render(<EditScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send my version'));
    });
    expect(editAndSend).toHaveBeenCalledWith(DECLINE_ID, BODY);
  });

  it('never stands in for a different draft', () => {
    mockQueue.drafts = [];
    stageDeclineHandoff(makeDraft({ messageId: DECLINE_ID, draftBody: BODY }));
    mockRouter.params = { messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d' };
    render(<EditScreen />);
    expect(screen.getByText('That draft is no longer pending.')).toBeTruthy();
  });

  it('lets go of the handoff when the takeover closes', () => {
    mockQueue.drafts = [];
    stageDeclineHandoff(makeDraft({ messageId: DECLINE_ID, draftBody: BODY }));
    mockRouter.params = { messageId: DECLINE_ID, prefill: BODY };
    const view = render(<EditScreen />);
    view.unmount();
    expect(peekDeclineHandoff(DECLINE_ID)).toBeNull();
  });
});

// TAC-364. The takeover sits on the ground of the card that was swiped, passed
// as a route param, and its header says what kind of decision it is and why, in
// the same two registers as the card.
describe('EditScreen — ground and header (TAC-364)', () => {
  const DECLINE_ID = '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f';
  const BODY = "So sorry, we can't do the cortado today after all.";

  beforeEach(() => {
    mockGround.name = null;
  });

  afterEach(() => {
    __resetDeclineHandoffForTests();
  });

  it('sits on the bucket the card passed in', async () => {
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId, bucket: 'obligation' };
    await renderAndDrain();
    expect(mockGround.name).toBe('obligation');
  });

  it("derives the ground from the draft's code when no bucket was passed", async () => {
    mockQueue.drafts = [makeDraft({ reviewReasonCode: 'knowledge_gap' })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    await renderAndDrain();
    expect(mockGround.name).toBe('outsideDraft');
  });

  // A route param is an untrusted string; the retired ground names are the
  // likeliest thing to arrive in one.
  it('ignores a bucket param it does not recognise', async () => {
    mockQueue.drafts = [makeDraft({ reviewReasonCode: 'model_flagged' })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId, bucket: 'queueClay' };
    await renderAndDrain();
    expect(mockGround.name).toBe('draftWrong');
  });

  it('names the decision in caps and the reason in sentence case', async () => {
    mockQueue.drafts = [
      makeDraft({
        reviewReasonCode: 'commitment_type_gated',
        reviewReason: 'This offers something free. Your call.',
      }),
    ];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    await renderAndDrain();
    expect(screen.getByText('OBLIGATION')).toBeTruthy();
    expect(screen.getByText('This offers something free. Your call.')).toBeTruthy();
    expect(screen.queryByText(/FLAGGED/)).toBeNull();
  });

  it('lists the other triggers and quotes a flagged claim', async () => {
    const claim = 'the patio heaters run until close';
    mockQueue.drafts = [
      makeDraft({
        reviewReasonCode: 'knowledge_gap_backstop',
        reviewReason: "I wasn't sure this was true, so I didn't send it.",
        reviewTriggers: ['knowledge_gap_backstop', 'hold_all_outbound'],
        reviewTriggerLabels: [
          "I wasn't sure this was true, so I didn't send it.",
          "You're holding everything here right now.",
        ],
        ungroundedClaims: [claim],
      }),
    ];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    await renderAndDrain();
    expect(screen.getByLabelText("Also: You're holding everything here right now.")).toBeTruthy();
    expect(screen.getByLabelText(`Couldn't verify: “${claim}”`)).toBeTruthy();
  });

  // Frame D1: the operator is still dealing with the heads-up card, so the
  // decline opens on Bay, although the decline draft's own code is mid-thread.
  it('opens a decline on the heads-up ground, headed "Commitment"', () => {
    mockQueue.drafts = [];
    stageDeclineHandoff(
      makeDraft({
        messageId: DECLINE_ID,
        draftBody: BODY,
        reviewReasonCode: 'operator_decline_initiated',
      }),
    );
    mockRouter.params = { messageId: DECLINE_ID, prefill: BODY, bucket: 'headsUp' };
    render(<EditScreen />);
    expect(mockGround.name).toBe('headsUp');
    expect(screen.getByText('COMMITMENT')).toBeTruthy();
    expect(screen.queryByText('MID-THREAD')).toBeNull();
  });

  it('keeps the bucket when a failed send reopens the takeover', async () => {
    (editAndSend as jest.Mock).mockResolvedValue({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'boom' },
    });
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId, bucket: 'obligation' };
    render(<EditScreen />);
    fireEvent.changeText(screen.getByLabelText('Edit the draft before sending'), 'retry me');
    fireEvent.press(screen.getByLabelText('Send my version'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/queue/edit',
      params: {
        messageId: mockQueue.drafts[0].messageId,
        prefill: 'retry me',
        bucket: 'obligation',
      },
    });
  });

  it('falls back to clay when the draft is gone', () => {
    mockQueue.drafts = [];
    render(<EditScreen />);
    expect(mockGround.name).toBe('resting');
  });
});

// TAC-388. The takeover opens as a transparent modal, where the native safe-area
// view reports no top inset, so its header drew under the status bar (the clock
// sat on top of BACK). And the pinned block had nothing behind it, so the thread
// showed through beneath it. Both routes in render this same header. These pin
// the layout; that it clears the clock on a phone is device UAT.
describe('EditScreen: chrome (TAC-388)', () => {
  const DECLINE_ID = '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f';
  const BODY = "So sorry, we can't do the cortado today after all.";
  const STATUS_BAR = 62;

  beforeEach(() => {
    mockInsets.top = STATUS_BAR;
  });

  afterEach(() => {
    __resetDeclineHandoffForTests();
  });

  async function openFrom(route: 'draft' | 'decline'): Promise<string> {
    if (route === 'draft') {
      mockRouter.params = { messageId: mockQueue.drafts[0].messageId, bucket: 'obligation' };
    } else {
      mockQueue.drafts = [];
      stageDeclineHandoff(
        makeDraft({
          messageId: DECLINE_ID,
          draftBody: BODY,
          reviewReasonCode: 'operator_decline_initiated',
        }),
      );
      mockRouter.params = { messageId: DECLINE_ID, prefill: BODY, bucket: 'headsUp' };
    }
    await renderAndDrain();
    return mockRouter.params.bucket as string;
  }

  function isInside(
    node: ReturnType<typeof screen.getByTestId>,
    container: ReturnType<typeof screen.getByTestId>,
  ): boolean {
    for (let cursor = node.parent; cursor; cursor = cursor.parent) {
      if (cursor === container) return true;
    }
    return false;
  }

  it.each(['draft', 'decline'] as const)(
    'pads the header row below the status bar, opened from a %s',
    async (route) => {
      await openFrom(route);
      const row = StyleSheet.flatten(screen.getByTestId('takeover-header-row').props.style);
      expect(row.paddingTop).toBe(STATUS_BAR + takeoverHeader.rowPaddingTopPx);
      // The header pads the top itself, so the ground must not add it again.
      expect(mockGround.edges).toEqual(['left', 'right']);
    },
  );

  it.each(['draft', 'decline'] as const)(
    'backs the pinned block with its own ground and clips the thread, opened from a %s',
    async (route) => {
      const bucket = await openFrom(route);
      const pinned = screen.getByTestId('takeover-pinned-header');
      expect(StyleSheet.flatten(pinned.props.style)).toMatchObject({ overflow: 'hidden' });
      expect(within(pinned).getByTestId(`ground-${bucket}`)).toBeTruthy();

      const clip = screen.getByTestId('takeover-thread-clip');
      expect(StyleSheet.flatten(clip.props.style)).toMatchObject({ overflow: 'hidden' });
      const thread = screen.UNSAFE_getByType(ScrollView);
      expect(isInside(thread, clip)).toBe(true);
      expect(isInside(thread, pinned)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TAC-411 — the zero-bubble takeover.
//
// TAC-395 made this newly reachable. A guest whose only inbound was media-only
// carries `body: ''` (analog-guest's webhook inserts `payload.content ?? ''`,
// and the messages CHECK allows it when media_urls or reaction_type is set),
// which fails the Contract's condition 1. So both `recentContext` and the
// thread endpoint come back empty for them, and the thread area sat blank —
// indistinguishable from a screen that failed to load.
//
// Same copy as the Conversations thread, ruled 2026-09-15: the two surfaces
// answer the same question and must not answer it differently.
// ---------------------------------------------------------------------------
describe('EditScreen — zero-bubble thread (TAC-411)', () => {
  const EMPTY_COPY = 'Nothing has reached this guest yet.';

  it('shows the empty state when recentContext and the thread are both empty', async () => {
    mockQueue.drafts = [makeDraft({ recentContext: [] })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockResolvedValue({ ok: true, data: [] });

    render(<EditScreen />);

    await waitFor(() => expect(screen.getByText(EMPTY_COPY)).toBeTruthy());
  });

  it('shows it on a fetch failure too, when there is no recentContext to fall back on', async () => {
    // The fallback path keeps recentContext; with none, the result is the same
    // empty thread, and the operator is owed the same explanation.
    mockQueue.drafts = [makeDraft({ recentContext: [] })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });

    render(<EditScreen />);

    await waitFor(() => expect(screen.getByText(EMPTY_COPY)).toBeTruthy());
  });

  it('does NOT show it when the thread has bubbles', async () => {
    // The default draft carries one recentContext entry.
    (getThread as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        {
          id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
          direction: 'inbound',
          body: 'is the patio open',
          createdAt: '2026-05-14T16:00:00.000Z',
        },
      ],
    });

    render(<EditScreen />);

    await waitFor(() => expect(screen.getByText('is the patio open')).toBeTruthy());
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it('does NOT show it for an empty-bodied bubble, which still renders', async () => {
    // Ruling 1 on this ticket: empty-body `recentContext` entries are left
    // alone and still draw a (blank) bubble. That is a bubble, so the thread
    // is not empty and the empty state must not claim it is.
    mockQueue.drafts = [
      makeDraft({
        recentContext: [
          {
            id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
            direction: 'inbound',
            body: '',
            createdAt: '2026-05-14T16:00:00.000Z',
          },
        ],
      }),
    ];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });

    render(<EditScreen />);

    await waitFor(() => expect(screen.getByTestId('takeover-thread-clip')).toBeTruthy());
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it('backs the line, because the takeover sits on a card ground', async () => {
    // White 32px is large text, so the bar is 3:1 — and on Honey the line
    // measures 2.62:1 unbacked. The Conversations thread sits on clay and
    // passes no `backed`; this surface must. (SR-1; see ground-contrast.)
    mockQueue.drafts = [makeDraft({ recentContext: [] })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockResolvedValue({ ok: true, data: [] });

    render(<EditScreen />);

    await waitFor(() => expect(screen.getByText(EMPTY_COPY)).toBeTruthy());
    expect(screen.getByTestId('empty-state-backing')).toBeTruthy();
  });

  it('withholds the claim while the fetch is still out', async () => {
    // "Nothing has reached this guest yet" is a claim, and before the fetch
    // answers we do not have it. Without this gate the screen asserts it on
    // mount and then replaces it with bubbles — a flash of a false statement
    // about a guest. Never resolving the promise holds the screen in
    // `kind: 'loading'`.
    mockQueue.drafts = [makeDraft({ recentContext: [] })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<EditScreen />);

    // The screen has mounted — the composer is up — and the thread area is
    // still empty, but says nothing about why.
    expect(screen.getByTestId('takeover-thread-clip')).toBeTruthy();
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  // The decline handoff's `recentContext: []` is a placeholder meaning
  // "unknown", not the server's answer — and its guest is by construction one
  // the agent already promised something to. Claiming nothing reached them,
  // above an apology addressed to them, is the false statement this copy
  // exists to avoid.
  describe('the decline handoff\'s fabricated seed', () => {
    const DECLINE_ID = '77e9c4b6-7e8d-4fa0-9c2b-3e4f5a6b7c8d';

    afterEach(() => {
      __resetDeclineHandoffForTests();
    });

    it('makes no claim when the fetch FAILS and the seed is the staged one', async () => {
      mockQueue.drafts = [];
      stageDeclineHandoff(
        makeDraft({ messageId: DECLINE_ID, draftBody: 'sorry about that', recentContext: [] }),
      );
      mockRouter.params = { messageId: DECLINE_ID };
      (getThread as jest.Mock).mockResolvedValue({
        ok: false,
        error: { kind: 'NETWORK', message: 'offline' },
      });

      render(<EditScreen />);

      await waitFor(() => expect(screen.getByDisplayValue('sorry about that')).toBeTruthy());
      expect(screen.queryByText(EMPTY_COPY)).toBeNull();
    });

    it('DOES claim when the fetch succeeds and the server says the thread is empty', async () => {
      // Same staged seed, but now the emptiness is the server's answer rather
      // than our placeholder, so the claim is supported.
      mockQueue.drafts = [];
      stageDeclineHandoff(
        makeDraft({ messageId: DECLINE_ID, draftBody: 'sorry about that', recentContext: [] }),
      );
      mockRouter.params = { messageId: DECLINE_ID };
      (getThread as jest.Mock).mockResolvedValue({ ok: true, data: [] });

      render(<EditScreen />);

      await waitFor(() => expect(screen.getByText(EMPTY_COPY)).toBeTruthy());
    });
  });

  it('claims when a live removal empties the thread', async () => {
    // Where the two halves of this ticket meet: the channel decides the last
    // counting message stopped counting, and the screen is left with nothing.
    // The claim is true here — it just became true.
    //
    // `recentContext: []` matters: the default draft carries one entry, and
    // `reconcileFetchedThread` keeps it alongside the fetched row, so removing
    // the fetched row would leave the thread non-empty. Caught by this test
    // failing on the first run.
    mockQueue.drafts = [makeDraft({ recentContext: [] })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        {
          id: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
          direction: 'outbound',
          body: 'the only message that counted',
          createdAt: '2026-05-14T16:01:00.000Z',
        },
      ],
    });
    let captured: { onRemove: (id: string) => void } | null = null;
    (useThreadRealtime as jest.Mock).mockImplementation((opts) => {
      captured = opts;
    });

    render(<EditScreen />);
    await waitFor(() =>
      expect(screen.getByText('the only message that counted')).toBeTruthy(),
    );
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();

    act(() => {
      captured!.onRemove('33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a');
    });

    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it('shows both empty states at once when the draft is blank too', async () => {
    // A blank-body draft for a media-only guest hits both. They are different
    // claims about different things and must not be collapsed into one.
    mockQueue.drafts = [makeDraft({ recentContext: [], draftBody: '' })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockResolvedValue({ ok: true, data: [] });

    render(<EditScreen />);

    await waitFor(() => expect(screen.getByText(EMPTY_COPY)).toBeTruthy());
    expect(screen.getByPlaceholderText('Type your answer to send to the guest')).toBeTruthy();
  });

  it('does not confuse an empty THREAD with an empty DRAFT', async () => {
    // A blank `draftBody` has its own composer placeholder (TAC-310) and says
    // nothing about whether the guest has been reached. A draft with a body
    // and no thread still gets the empty state.
    mockQueue.drafts = [makeDraft({ recentContext: [], draftBody: 'a real draft' })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    (getThread as jest.Mock).mockResolvedValue({ ok: true, data: [] });

    render(<EditScreen />);

    await waitFor(() => expect(screen.getByText(EMPTY_COPY)).toBeTruthy());
    expect(screen.getByDisplayValue('a real draft')).toBeTruthy();
  });
});


/**
 * The takeover is the SECOND send path, and it outlives the swipe that opened
 * it (TAC-486).
 *
 * `swipeActionFor` stops an expired card being OPENED, but a takeover opened
 * while the window was still open stays open and sendable across expiry, and a
 * long edit outlasts the 5-minute display margin easily. Without this check the
 * send goes out, the server refuses it with a 502 for a closed Instagram
 * window, and the operator gets a generic "couldn't send" toast that says
 * nothing about why.
 */
describe('sending from the takeover after the window shuts', () => {
  const NOW = Date.parse('2026-09-23T12:00:00.000Z');
  /** A deadline leaving `minutes` of window AFTER the display margin. */
  const leaving = (minutes: number): string =>
    new Date(NOW + (minutes + 5) * 60_000).toISOString();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    (editAndSend as jest.Mock).mockResolvedValue({ ok: true, data: undefined });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function openWith(overrides: Partial<PendingDraft>): void {
    mockQueue.drafts = [makeDraft(overrides)];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    render(<EditScreen />);
    fireEvent.changeText(
      screen.getByLabelText('Edit the draft before sending'),
      'my edited answer',
    );
  }

  it('refuses the send and names the window', async () => {
    openWith({
      guestChannel: 'instagram',
      instagramUsername: 'mia.brews',
      guestPhoneFallback: '',
      replyWindowExpiresAt: leaving(-3 * 60),
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send my version'));
    });
    expect(editAndSend).not.toHaveBeenCalled();
  });

  it('leaves the card in the queue rather than optimistically clearing it', async () => {
    openWith({
      guestChannel: 'instagram',
      instagramUsername: 'mia.brews',
      guestPhoneFallback: '',
      replyWindowExpiresAt: leaving(-1),
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send my version'));
    });
    expect(mockQueue.optimisticallyRemove).not.toHaveBeenCalled();
  });

  it('still sends while the window is open', async () => {
    openWith({
      guestChannel: 'instagram',
      instagramUsername: 'mia.brews',
      guestPhoneFallback: '',
      replyWindowExpiresAt: leaving(4 * 60),
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send my version'));
    });
    expect(editAndSend).toHaveBeenCalledWith(
      mockQueue.drafts[0].messageId,
      'my edited answer',
    );
  });

  it('still sends a text draft, which has no window at all', async () => {
    openWith({});
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send my version'));
    });
    expect(editAndSend).toHaveBeenCalled();
  });
});

describe('EditScreen — what the draft is answering (TAC-533)', () => {
  const OAT = 'a1b2c3d4-4444-4a5b-8c6d-7e8f9a0b1c2d';
  const SUNDAY = 'a1b2c3d4-4446-4a5b-8c6d-7e8f9a0b1c2d';

  const answeringOat = {
    messageId: OAT,
    body: 'do you have oat milk for any drink?',
  };

  /** The question, then a newer unrelated one that opened its own card. */
  const buriedThread = [
    {
      id: OAT,
      direction: 'inbound' as const,
      body: 'do you have oat milk for any drink?',
      createdAt: '2026-09-23T18:00:00.000Z',
    },
    {
      id: SUNDAY,
      direction: 'inbound' as const,
      body: 'and are you open on sunday mornings?',
      createdAt: '2026-09-23T18:06:00.000Z',
    },
  ];

  it('names the question above the composer, where the reply is being rewritten', async () => {
    mockQueue.drafts = [makeDraft({ recentContext: buriedThread, replyingTo: answeringOat })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };

    await renderAndDrain();

    expect(screen.getByTestId('reply-quote')).toBeTruthy();
    expect(screen.getByLabelText(`Replying to: ${answeringOat.body}`)).toBeTruthy();
  });

  it('adds nothing when the thread already ends on the question', async () => {
    mockQueue.drafts = [
      makeDraft({ recentContext: [buriedThread[0]], replyingTo: answeringOat }),
    ];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };

    await renderAndDrain();

    expect(screen.queryByTestId('reply-quote')).toBeNull();
  });

  it('adds nothing while the server has not shipped the field', async () => {
    mockQueue.drafts = [makeDraft({ recentContext: buriedThread, replyingTo: null })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };

    await renderAndDrain();

    expect(screen.queryByTestId('reply-quote')).toBeNull();
  });
});
