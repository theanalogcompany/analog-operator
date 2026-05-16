import { ScrollView } from 'react-native';

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import EditScreen from '@/app/queue/edit';
import { type UseQueueResult } from '@/hooks/use-queue';
import { clearUndoState, getUndoState } from '@/hooks/use-undo-state';
import {
  type PendingDraft,
  PendingDraftSchema,
  editAndSend,
  skipDraft,
} from '@/lib/api/queue';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  params: {} as { messageId?: string; prefill?: string },
};

const mockQueue: UseQueueResult = {
  drafts: [],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
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
  (mockQueue.optimisticallyRemove as jest.Mock).mockReset();
  (mockQueue.restore as jest.Mock).mockReset();
  mockQueue.drafts = [makeDraft()];
  mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
  await clearUndoState();
});

afterEach(async () => {
  await clearUndoState();
});

describe('EditScreen', () => {
  it('prefills the textarea from agent_draft when no prefill param', () => {
    render(<EditScreen />);
    expect(screen.getByLabelText('Edit the draft before sending').props.value).toBe(
      "Yes — patio's open until 9.",
    );
  });

  it('prefills from the prefill param when present (failure-retry path)', () => {
    mockRouter.params = {
      messageId: mockQueue.drafts[0].messageId,
      prefill: 'my partially-typed retry attempt',
    };
    render(<EditScreen />);
    expect(screen.getByLabelText('Edit the draft before sending').props.value).toBe(
      'my partially-typed retry attempt',
    );
  });

  it('renders the "draft no longer pending" fallback when the draft is gone', () => {
    mockQueue.drafts = [];
    render(<EditScreen />);
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
    render(<EditScreen />);
    fireEvent.changeText(screen.getByLabelText('Edit the draft before sending'), '   ');
    fireEvent.press(screen.getByLabelText('Send my version'));
    // No need to wait — the early return is synchronous.
    expect(editAndSend).not.toHaveBeenCalled();
    expect(getUndoState()).toBeNull();
  });

  it('renders oldest-first when the upstream server payload was newest-first (parse-boundary sort lock-in)', () => {
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
    render(<EditScreen />);
    const bodies = screen.getAllByText(
      /(first inbound|middle outbound|latest inbound)/,
    );
    expect(bodies.map((n) => n.props.children)).toEqual([
      'first inbound',
      'middle outbound',
      'latest inbound',
    ]);
  });

  it('renders the full chronological recentContext inside the ScrollView (regression guard)', () => {
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
    render(<EditScreen />);
    expect(screen.getByText('first inbound')).toBeTruthy();
    expect(screen.getByText('middle outbound')).toBeTruthy();
    expect(screen.getByText('latest inbound')).toBeTruthy();
  });

  it('renders agentReasoning outside the ScrollView when non-null', () => {
    mockQueue.drafts = [
      makeDraft({ agentReasoning: 'lean into the warmth' }),
    ];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    render(<EditScreen />);
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

  it('omits agentReasoning render when null', () => {
    mockQueue.drafts = [makeDraft({ agentReasoning: null })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    render(<EditScreen />);
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });

  it('omits agentReasoning render when empty string (defensive trim)', () => {
    mockQueue.drafts = [makeDraft({ agentReasoning: '   ' })];
    mockRouter.params = { messageId: mockQueue.drafts[0].messageId };
    render(<EditScreen />);
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });
});

