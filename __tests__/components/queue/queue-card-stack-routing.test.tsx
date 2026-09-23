import { act, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueueCardStack } from '@/components/queue/queue-card-stack';
import { TICK_MS, __resetNowClockForTests } from '@/hooks/use-now';
import { type UseQueueSwipeArgs } from '@/hooks/use-queue-swipe';
import {
  type HeadsUpCommitment,
  type PendingDraft,
  getThread,
} from '@/lib/api/queue';
import {
  type QueueItem,
  draftItem,
  headsUpItem,
  headsUpItemKey,
} from '@/lib/queue-items';

/**
 * The no-send guard, at the seam where a swipe becomes an action. (TAC-364.)
 *
 * A heads-up card rides the same swipe chassis as a draft card, so the claim
 * that matters is "a swipe on a heads-up card never reaches the send path".
 * CLAUDE.md is explicit that a claim about the swipe cannot be made by a test
 * that mocks the swipe away, so the gesture hook is NOT replaced here: the real
 * `useQueueSwipe` runs, and the wrapper below only records the callbacks the
 * stack handed it. Invoking a recorded `onCommitRight` is exactly what the pan's
 * `onEnd` does on a right commit (`runOnJS(onCommitRight)()` in
 * hooks/use-queue-swipe.ts); which outcome a given drag produces is covered by
 * `resolveSwipeOutcome`'s own tests.
 *
 * Why not drive the pan itself: `fireGestureHandler` from RNGH's jest-utils
 * registers these gestures but never invokes their callbacks under this
 * project's jest-expo + Reanimated 4 setup. Tried with and without
 * `react-native-gesture-handler/jestSetup` and with `runOnJS(true)`; the
 * recorded call list stayed empty every time. The hook's arguments are the
 * last point before the gesture system, so that is the seam.
 */

const mockSwipe: {
  args: UseQueueSwipeArgs | null;
  result: ReturnType<typeof import('@/hooks/use-queue-swipe').useQueueSwipe> | null;
} = { args: null, result: null };

jest.mock('@/hooks/use-queue-swipe', () => {
  const actual = jest.requireActual('@/hooks/use-queue-swipe');
  return {
    ...actual,
    useQueueSwipe: (args: UseQueueSwipeArgs) => {
      mockSwipe.args = args;
      const result = actual.useQueueSwipe(args);
      // The return value too, so the mid-pan expiry branch is drivable: it is
      // the one case the structural guard (no GestureDetector on an expired
      // card) cannot cover, because the pan started while the card was live.
      mockSwipe.result = result;
      return result;
    },
  };
});

// Haptics are feedback, not the behavior under test, and they call native.
jest.mock('@/hooks/use-haptics', () => ({
  useHaptics: () => ({
    swipeThresholdCrossed: jest.fn(),
    swipeRightSuccess: jest.fn(),
    swipeRefused: jest.fn(),
    swipeLeftEdit: jest.fn(),
  }),
}));

jest.mock('@/lib/api/queue', () => {
  const actual = jest.requireActual('@/lib/api/queue');
  return { ...actual, getThread: jest.fn() };
});

const getThreadMock = getThread as jest.MockedFunction<typeof getThread>;

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    venueTimezone: null,
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    replyingTo: null,
    draftBody: 'Patio is open until 9.',
    category: null,
    voiceFidelity: 0.81,
    reviewReason: null,
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    ...overrides,
  };
}

function makeCommitment(overrides: Partial<HeadsUpCommitment> = {}): HeadsUpCommitment {
  return {
    id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestId: 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    type: 'comp',
    guest: { name: 'Sam' },
    description: 'A cortado on the house',
    code: '7K2P',
    expected_arrival: null,
    created_at: '2026-09-14T08:00:00.000Z',
    recognitionState: 'regular',
    sourceMessageId: '66f9c4b6-7e8d-4fa0-9c2b-3e4f5a6b7c8d',
    ...overrides,
  };
}

function renderStack(items: QueueItem[], busyKey: string | null = null) {
  const handlers = {
    onApprove: jest.fn(),
    onEdit: jest.fn(),
    onRefuseApprove: jest.fn(),
    onAcknowledge: jest.fn(),
    onDecline: jest.fn(),
    onPressHelp: jest.fn(),
    onCopyAndOpen: jest.fn(),
    onOpenHandle: jest.fn(),
    onBlockedExpired: jest.fn(),
  };
  render(
    <Wrapper>
      <QueueCardStack
        items={items}
        position={1}
        total={items.length}
        busyKey={busyKey}
        {...handlers}
      />
    </Wrapper>,
  );
  return handlers;
}

function swipe(): UseQueueSwipeArgs {
  if (!mockSwipe.args) throw new Error('the stack never mounted a swipe');
  return mockSwipe.args;
}

function swipeResult() {
  if (!mockSwipe.result) throw new Error('the stack never mounted a swipe');
  return mockSwipe.result;
}

beforeEach(() => {
  mockSwipe.args = null;
  mockSwipe.result = null;
  getThreadMock.mockReset();
  getThreadMock.mockResolvedValue({ ok: true, data: [] });
});

describe('a swipe on a heads-up card never reaches the send path', () => {
  it('swipe-right acknowledges, and never approves', async () => {
    const commitment = makeCommitment();
    const handlers = renderStack([headsUpItem(commitment)]);
    await act(async () => {
      swipe().onCommitRight();
    });
    expect(handlers.onAcknowledge).toHaveBeenCalledWith(commitment);
    expect(handlers.onApprove).not.toHaveBeenCalled();
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(handlers.onDecline).not.toHaveBeenCalled();
  });

  it('swipe-left declines, and never opens a draft or sends', async () => {
    const commitment = makeCommitment();
    const handlers = renderStack([headsUpItem(commitment)]);
    await act(async () => {
      swipe().onCommitLeft();
    });
    expect(handlers.onDecline).toHaveBeenCalledWith(commitment);
    expect(handlers.onApprove).not.toHaveBeenCalled();
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(handlers.onAcknowledge).not.toHaveBeenCalled();
  });

  it('a refusal does nothing at all', async () => {
    const handlers = renderStack([headsUpItem(makeCommitment())]);
    await act(async () => {
      swipe().onRefuseRight();
    });
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('never refuses swipe-right, so an acknowledge always completes', () => {
    renderStack([headsUpItem(makeCommitment({ description: '', code: null }))]);
    expect(swipe().canCommitRight).toBe(true);
  });

  it('turns the gesture off while its decline is being written', () => {
    const commitment = makeCommitment();
    renderStack([headsUpItem(commitment)], headsUpItemKey(commitment.id));
    expect(swipe().enabled).toBe(false);
  });
});

describe('a swipe on a draft card routes as it always has', () => {
  it('swipe-right approves, and never acknowledges', async () => {
    const draft = makeDraft();
    const handlers = renderStack([draftItem(draft)]);
    await act(async () => {
      swipe().onCommitRight();
    });
    expect(handlers.onApprove).toHaveBeenCalledWith(draft);
    expect(handlers.onAcknowledge).not.toHaveBeenCalled();
  });

  it('swipe-left opens the editor, and never declines', async () => {
    const draft = makeDraft();
    const handlers = renderStack([draftItem(draft)]);
    await act(async () => {
      swipe().onCommitLeft();
    });
    expect(handlers.onEdit).toHaveBeenCalledWith(draft);
    expect(handlers.onDecline).not.toHaveBeenCalled();
  });

  it('a refused swipe-right on a blank draft explains itself', async () => {
    const draft = makeDraft({ draftBody: '' });
    const handlers = renderStack([draftItem(draft)]);
    expect(swipe().canCommitRight).toBe(false);
    await act(async () => {
      swipe().onRefuseRight();
    });
    expect(handlers.onRefuseApprove).toHaveBeenCalledWith(draft);
    expect(handlers.onApprove).not.toHaveBeenCalled();
  });

  it('fetches no thread for a draft card', () => {
    renderStack([draftItem(makeDraft())]);
    expect(getThreadMock).not.toHaveBeenCalled();
  });
});

describe('what a heads-up card shows', () => {
  it('has no composer, and says nothing sends', async () => {
    renderStack([headsUpItem(makeCommitment())]);
    await act(async () => {});
    expect(screen.queryByTestId('queue-card-composer')).toBeNull();
    expect(screen.getByTestId('heads-up-commitment')).toBeTruthy();
    expect(screen.getByText('NOTHING SENDS EITHER WAY')).toBeTruthy();
  });

  it('reads Decline and Acknowledge, and drops the help link', async () => {
    renderStack([headsUpItem(makeCommitment())]);
    await act(async () => {});
    expect(screen.getByLabelText('Swipe left to decline')).toBeTruthy();
    expect(screen.getByLabelText('Swipe right to acknowledge')).toBeTruthy();
    expect(screen.queryByLabelText('Swipe right to send')).toBeNull();
    expect(screen.queryByLabelText('Chat with Jaipal via SMS')).toBeNull();
  });

  it('shows the code chip on a comp', async () => {
    renderStack([headsUpItem(makeCommitment())]);
    await act(async () => {});
    expect(screen.getByTestId('heads-up-code-chip')).toBeTruthy();
    expect(screen.getByLabelText('Code 7K2P')).toBeTruthy();
  });

  it('shows no chip on a recommendation', async () => {
    renderStack([
      headsUpItem(makeCommitment({ type: 'recommendation', code: null })),
    ]);
    await act(async () => {});
    expect(screen.queryByTestId('heads-up-code-chip')).toBeNull();
  });

  it('renders the conversation the commitment came from', async () => {
    getThreadMock.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'aa07d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'omw now!',
          createdAt: '2026-09-14T08:58:00.000Z',
        },
      ],
    });
    const commitment = makeCommitment();
    renderStack([headsUpItem(commitment)]);
    expect(await screen.findByText('omw now!')).toBeTruthy();
    expect(getThreadMock).toHaveBeenCalledWith(commitment.sourceMessageId);
  });
});

/**
 * The expired guard at the same seam (TAC-486).
 *
 * **What this can and cannot prove.** The real guard is structural: an expired
 * card is rendered OUTSIDE the `GestureDetector` entirely, so there is no
 * gesture to start. That is not observable from Jest — a probe comparing the
 * rendered host-component types of a live card and an expired one found them
 * identical, because `GestureDetector` contributes no host node of its own. So
 * the structural half is carried by the code and by device UAT, and what is
 * asserted here is the second guard: the arguments the stack hands the gesture,
 * and what its callbacks do if one somehow fires.
 *
 * That second guard is the one that matters for the case the structure cannot
 * cover anyway — a card that expires WHILE a pan is already in flight.
 */
describe('a draft whose reply window has shut', () => {
  const NOW = Date.parse('2026-09-23T12:00:00.000Z');
  /** A deadline leaving `minutes` of window AFTER the 5 minute display margin. */
  const leaving = (minutes: number): string =>
    new Date(NOW + (minutes + 5) * 60_000).toISOString();

  const igDraft = (over: Partial<PendingDraft>): PendingDraft =>
    makeDraft({
      guestChannel: 'instagram',
      instagramUsername: 'mia.brews',
      guestPhoneFallback: '',
      ...over,
    });

  const expiredDraft = () =>
    draftItem(
      makeDraft({
        guestChannel: 'instagram',
        instagramUsername: 'mia.brews',
        guestPhoneFallback: '',
        replyWindowExpiresAt: leaving(-3 * 60),
        draftBody: 'a perfectly good draft',
      }),
    );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    __resetNowClockForTests();
  });

  afterEach(() => {
    __resetNowClockForTests();
    jest.useRealTimers();
  });

  it('turns the gesture off rather than leaving it armed', () => {
    renderStack([expiredDraft()]);
    expect(swipe().enabled).toBe(false);
  });

  it('refuses a right-commit even though the draft has a body', () => {
    renderStack([expiredDraft()]);
    // Not the blank-draft refusal: the body is fine, the window is not.
    expect(swipe().canCommitRight).toBe(false);
  });

  it('never reaches the send path if a commit fires anyway', () => {
    const handlers = renderStack([expiredDraft()]);
    act(() => {
      swipe().onCommitRight();
    });
    expect(handlers.onApprove).not.toHaveBeenCalled();
    expect(handlers.onBlockedExpired).toHaveBeenCalledTimes(1);
  });

  it('never opens the composer if a left-commit fires anyway', () => {
    // Opening the editor would offer an edit that ends in a send that cannot
    // happen.
    const handlers = renderStack([expiredDraft()]);
    act(() => {
      swipe().onCommitLeft();
    });
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(handlers.onBlockedExpired).toHaveBeenCalledTimes(1);
  });

  /**
   * The window shutting under the operator's hands, which the structure cannot
   * prevent: the pan began while the card was live.
   *
   * Ruled 2026-09-23: the card converts the moment it expires, a gesture in
   * flight is cancelled, and the operator is told why. A card that expires
   * while nobody is touching it owes nothing, because nobody tried anything.
   */
  it('cancels an in-flight pan, resets it, and explains', () => {
    const live = igDraft({
      messageId: '44444444-4444-4444-8444-444444444444',
      guestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      replyWindowExpiresAt: leaving(1),
      draftBody: 'a perfectly good draft',
    });
    const handlers = renderStack([draftItem(live)]);

    // A finger goes down while the card is still live.
    act(() => {
      swipeResult().isPanning.value = true;
      swipeResult().translateX.value = 60;
    });
    expect(handlers.onBlockedExpired).not.toHaveBeenCalled();

    // The window shuts under it.
    act(() => {
      jest.setSystemTime(NOW + 2 * 60_000);
      jest.advanceTimersByTime(TICK_MS);
    });

    expect(handlers.onBlockedExpired).toHaveBeenCalledTimes(1);
    // A pan abandoned at 60px would otherwise leave the card sitting crooked:
    // FrontCard is keyed by the item and does not remount on a window change.
    expect(swipeResult().translateX.value).toBe(0);
    expect(swipeResult().isPanning.value).toBe(false);
  });

  it('says nothing when a card expires with no finger on it', () => {
    const live = igDraft({
      messageId: '55555555-5555-4555-8555-555555555555',
      guestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      replyWindowExpiresAt: leaving(1),
      draftBody: 'a perfectly good draft',
    });
    const handlers = renderStack([draftItem(live)]);

    act(() => {
      jest.setSystemTime(NOW + 2 * 60_000);
      jest.advanceTimersByTime(TICK_MS);
    });

    expect(handlers.onBlockedExpired).not.toHaveBeenCalled();
  });

  it('still sends and edits normally while the window is open', () => {
    const live = draftItem(
      makeDraft({
        guestChannel: 'instagram',
        instagramUsername: 'mia.brews',
        replyWindowExpiresAt: leaving(4 * 60),
        draftBody: 'a perfectly good draft',
      }),
    );
    const handlers = renderStack([live]);
    expect(swipe().enabled).toBe(true);
    act(() => {
      swipe().onCommitRight();
    });
    expect(handlers.onApprove).toHaveBeenCalledTimes(1);
    expect(handlers.onBlockedExpired).not.toHaveBeenCalled();
  });
});
