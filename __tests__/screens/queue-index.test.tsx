import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import QueueScreen from '@/app/queue/index';
import { type GroundName } from '@/lib/grounds';
import { type QueueContextValue } from '@/lib/queue-context';
import { clearUndoState } from '@/hooks/use-undo-state';
import {
  type HeadsUpCommitment,
  type PendingDraft,
  acknowledgeCommitment,
  approveDraft,
  declineCommitment,
} from '@/lib/api/queue';
import {
  __resetDeclineHandoffForTests,
  peekDeclineHandoff,
} from '@/lib/decline-handoff';
import { type QueueItem } from '@/lib/queue-items';
import { HEADS_UP_TONE } from '@/lib/queue-tone';
import {
  __resetTapStateForTests,
  setPendingTap,
} from '@/lib/notifications/tap-handler';

type CardStackProps = {
  items: QueueItem[];
  position: number;
  total: number;
  busyKey?: string | null;
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
  onRefuseApprove: (draft: PendingDraft) => void;
  onAcknowledge: (commitment: HeadsUpCommitment) => void | Promise<void>;
  onDecline: (commitment: HeadsUpCommitment) => void | Promise<void>;
  onPressHelp: () => void;
};
let lastCardStackProps: CardStackProps | null = null;
let lastGroundName: GroundName | null = null;
const mockRouterPush = jest.fn();

// The draft cards the screen handed the stack, in deck order. Heads-up cards
// ride the same `items` list (TAC-364); the tests that use this are about drafts.
function stackDrafts(): PendingDraft[] {
  return (lastCardStackProps?.items ?? []).flatMap((item) =>
    item.kind === 'draft' ? [item.draft] : [],
  );
}

type SessionStub = { status: 'signed-in'; session: { user: { email: string | null } } };

const mockQueue: QueueContextValue = {
  drafts: [],
  commitments: [],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
  optimisticallyRemoveCommitment: jest.fn(),
  restoreCommitment: jest.fn(),
  findVenueIdForGuest: jest.fn().mockReturnValue(null),
};

const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// A single-venue operator, which is the shape every pre-existing test in this
// file assumes. The venue-switching behavior itself is covered in
// __tests__/screens/queue-index-venue.test.tsx.
const mockSelect = jest.fn();
let mockVenue = {
  venues: [
    { id: VENUE_A, name: "Le Mil's Coffee", slug: 'le-mils-coffee', timezone: 'America/Los_Angeles' },
  ],
  selectedVenueId: VENUE_A as string | null,
  selectedVenue: {
    id: VENUE_A,
    name: "Le Mil's Coffee",
    slug: 'le-mils-coffee',
    timezone: 'America/Los_Angeles',
  } as { id: string; name: string; slug: string; timezone: string } | null,
  status: 'ready' as 'loading' | 'ready' | 'error',
  select: mockSelect,
};

let mockSession: SessionStub = {
  status: 'signed-in',
  session: { user: { email: 'jaipal@theanalog.company' } },
};

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
  openSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn() }),
  usePathname: () => '/queue',
}));
jest.mock('@/lib/queue-context', () => ({ useQueueContext: () => mockQueue }));
jest.mock('@/lib/venue-context', () => ({ useVenueSelection: () => mockVenue }));
jest.mock('@/lib/auth/use-session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('@/components/queue/queue-card-stack', () => ({
  QueueCardStack: (props: CardStackProps) => {
    lastCardStackProps = props;
    return null;
  },
}));
// Captures the screen's ground DECISION. The claim under test is "this screen
// picks ground X for a card of tone Y", which is the screen's job; how a ground
// paints belongs to lib/grounds.ts and its own test.
jest.mock('@/components/ground/ground-screen', () => {
  const { View } = jest.requireActual('react-native');
  return {
    GroundScreen: ({ name, children }: { name: string; children: ReactNode }) => {
      lastGroundName = name as GroundName;
      return <View>{children}</View>;
    },
  };
});
jest.mock('@/components/queue/undo-toast', () => ({ UndoToast: () => null }));
jest.mock('@/lib/api/queue', () => {
  const actual = jest.requireActual('@/lib/api/queue');
  return {
    ...actual,
    approveDraft: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
    undoAction: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
    acknowledgeCommitment: jest.fn(),
    declineCommitment: jest.fn(),
  };
});
jest.mock('@/components/queue/empty-state', () => {
  const { Text } = jest.requireActual('react-native');
  return { EmptyState: () => <Text>empty-state-mock</Text> };
});

beforeEach(() => {
  mockQueue.drafts = [];
  mockQueue.commitments = [];
  mockSession = {
    status: 'signed-in',
    session: { user: { email: 'jaipal@theanalog.company' } },
  };
  (Linking.openURL as jest.Mock).mockClear();
  (approveDraft as jest.Mock).mockClear();
  (approveDraft as jest.Mock).mockResolvedValue({ ok: true, data: undefined });
  (mockQueue.optimisticallyRemove as jest.Mock).mockClear();
  (mockQueue.restore as jest.Mock).mockClear();
  lastCardStackProps = null;
  __resetTapStateForTests();
});

// A successful approve calls setUndoState, which arms a module-level expiry
// timer. Unlike showToast, its emitter doesn't early-return when no subscriber
// is mounted — and <UndoToast /> is mocked to null here — so the timer's only
// disposal path (last-subscriber unmount) never runs and the Jest worker is
// force-exited at suite end. Same guard queue-edit.test.tsx uses. See the
// "Module-level timers + subscriber refcount" gotcha in CLAUDE.md.
afterEach(async () => {
  await clearUndoState();
});

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueueScreen />
    </SafeAreaProvider>,
  );
}

const draftWithTone = (
  overrides: Partial<PendingDraft> = {},
): PendingDraft => ({
  messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  venueSlug: 'mock',
  venueTimezone: null,
  guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  guestDisplayName: 'A',
  guestPhoneFallback: '+15550001',
  draftBody: 'x',
  category: null,
  voiceFidelity: null,
  reviewReason: null,
  recognitionState: null,
  agentReasoning: null,
  pendingSinceMs: 1,
  recentContext: [],
  langfuseTraceId: null,
  ...overrides,
});

// The ground encodes WHY the top card was flagged, so the operator knows what
// kind of decision is in front of them before reading a word. That makes the
// mapping a behavior of this screen, not decoration.
describe('QueueScreen — the ground follows the top card', () => {
  it('goes clay for a low-fidelity flag', () => {
    mockQueue.drafts = [draftWithTone({ reviewReason: 'low fidelity score' })];
    renderScreen();
    expect(lastGroundName).toBe('queueClay');
  });

  it('goes stone for a new-guest flag', () => {
    mockQueue.drafts = [
      draftWithTone({ reviewReason: 'first message from new guest' }),
    ];
    renderScreen();
    expect(lastGroundName).toBe('queueStone');
  });

  it('goes ink when no draft was generated', () => {
    mockQueue.drafts = [
      draftWithTone({ reviewReason: 'no draft generated', draftBody: '' }),
    ];
    renderScreen();
    expect(lastGroundName).toBe('queueInk');
  });

  it('settles to neutral with an empty deck — no decision, no color', () => {
    mockQueue.drafts = [];
    renderScreen();
    expect(lastGroundName).toBe('neutral');
  });

  it('reads the top card, not the deck', () => {
    mockQueue.drafts = [
      draftWithTone({ reviewReason: 'no draft generated', draftBody: '' }),
      draftWithTone({
        messageId: '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        reviewReason: 'low fidelity score',
      }),
    ];
    renderScreen();
    expect(lastGroundName).toBe('queueInk');
  });
});

describe('QueueScreen — the retired chrome', () => {
  it('renders the three-tab nav', () => {
    renderScreen();
    expect(screen.getByLabelText('Queue')).toBeTruthy();
    expect(screen.getByLabelText('Texts')).toBeTruthy();
    expect(screen.getByLabelText('You')).toBeTruthy();
  });

  it('no longer renders a hamburger — sign-out lives on You', () => {
    renderScreen();
    expect(screen.queryByLabelText('Open menu')).toBeNull();
  });

  it('no longer renders the greeting or the meta row', () => {
    // The nav carries the count now; the greeting was a second, redundant
    // header competing with the card for the operator's attention.
    renderScreen();
    expect(screen.queryByTestId('queue-meta-row')).toBeNull();
    expect(screen.queryByText(/Good (morning|afternoon|evening)/)).toBeNull();
  });
});

describe('QueueScreen — session progress', () => {
  it('starts the counter at the first of however many loaded', () => {
    mockQueue.drafts = [
      draftWithTone(),
      draftWithTone({ messageId: '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d' }),
      draftWithTone({ messageId: '33a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d' }),
    ];
    renderScreen();
    expect(lastCardStackProps!.position).toBe(1);
    expect(lastCardStackProps!.total).toBe(3);
  });
});

describe('QueueScreen — the empty deck', () => {
  it('offers the help link, which is otherwise in the hint row', () => {
    mockQueue.drafts = [];
    renderScreen();
    fireEvent.press(screen.getByLabelText('Chat with Jaipal via SMS'));
    expect(Linking.openURL).toHaveBeenCalledWith('sms:+17869530853');
  });
});

describe('QueueScreen — surface-on-top from notification tap', () => {
  const TARGET_GUEST_ID = 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';
  const OTHER_GUEST_ID = 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';
  const THIRD_GUEST_ID = 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';

  const draftFor = (guestId: string, messageId: string) => ({
    messageId,
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock',
    venueTimezone: null,
    guestId,
    guestDisplayName: guestId.slice(0, 2).toUpperCase(),
    guestPhoneFallback: '+15550001',
    draftBody: 'body',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 1,
    recentContext: [],
    langfuseTraceId: null,
  });

  it('surfaces the pushed guest on top of the FIFO stack on mount', () => {
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(THIRD_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(TARGET_GUEST_ID, '33a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    setPendingTap({ kind: 'draft', guestId: TARGET_GUEST_ID });
    renderScreen();
    expect(lastCardStackProps).not.toBeNull();
    expect(stackDrafts()[0].guestId).toBe(TARGET_GUEST_ID);
    expect(stackDrafts().map((d) => d.guestId)).toEqual([
      TARGET_GUEST_ID,
      OTHER_GUEST_ID,
      THIRD_GUEST_ID,
    ]);
  });

  it('falls back to natural FIFO order when the pushed guest is not in the queue', () => {
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(THIRD_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    setPendingTap({ kind: 'draft', guestId: TARGET_GUEST_ID }); // not in drafts
    renderScreen();
    expect(stackDrafts().map((d) => d.guestId)).toEqual([
      OTHER_GUEST_ID,
      THIRD_GUEST_ID,
    ]);
  });

  it('restores natural FIFO order after the surfaced card is approved', () => {
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(TARGET_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    setPendingTap({ kind: 'draft', guestId: TARGET_GUEST_ID });
    renderScreen();
    expect(stackDrafts()[0].guestId).toBe(TARGET_GUEST_ID);

    // Simulate the operator approving the surfaced card. The screen calls
    // optimisticallyRemove (here a no-op mock — we control drafts directly)
    // and clears surfacedGuestId. We assert by feeding new drafts and
    // re-rendering: natural FIFO order should be honored.
    act(() => {
      lastCardStackProps!.onApprove(
        draftFor(TARGET_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      );
    });

    // Reflect the optimistic removal in the mock queue.
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    renderScreen();
    expect(stackDrafts().map((d) => d.guestId)).toEqual([
      OTHER_GUEST_ID,
    ]);
  });
});

// TAC-310. Swipe-right is the second of the two send entry points, and it was
// the one that produced the 422 empty_body: `/approve` carries no request body,
// so the server ships whatever draft body it has stored — and for a card whose
// draft was never generated, that's `""`. The card looked sendable, the swipe
// looked like it worked, and nothing shipped. These lock the local block.
describe('QueueScreen — handleApprove, the screen’s approve entry', () => {
  const GUEST_ID = 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';
  const MESSAGE_ID = '5f364358-db56-4f8e-9eba-661544855cd1';

  const draftWithBody = (draftBody: string): PendingDraft => ({
    messageId: MESSAGE_ID,
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock',
    venueTimezone: null,
    guestId: GUEST_ID,
    guestDisplayName: 'Priya N.',
    guestPhoneFallback: '+15551110004',
    draftBody,
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 120_000,
    recentContext: [],
    langfuseTraceId: null,
  });

  // NOT a swipe. `QueueCardStack` is mocked to null here, so nothing in this
  // block observes the gesture — it drives the screen's approve handler
  // directly. The swipe's own refusal lives in `use-queue-swipe.ts` and is
  // tested against `resolveSwipeOutcome`; conflating the two is what let
  // TAC-312 ship green. (CLAUDE.md, "Never mock the layer whose behavior you
  // are claiming.")
  async function approveDirectly(draft: PendingDraft): Promise<void> {
    mockQueue.drafts = [draft];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onApprove(draft);
    });
  }

  it('sends when the draft body is present', async () => {
    await approveDirectly(draftWithBody('Patio is open until 9 — come by.'));
    expect(approveDraft).toHaveBeenCalledWith(MESSAGE_ID);
    expect(mockQueue.optimisticallyRemove).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('blocks locally on a genuinely-empty draft — no network call', async () => {
    await approveDirectly(draftWithBody(''));
    expect(approveDraft).not.toHaveBeenCalled();
  });

  it('blocks locally on a whitespace-only draft — no network call', async () => {
    await approveDirectly(draftWithBody('   \n  '));
    expect(approveDraft).not.toHaveBeenCalled();
  });

  it('leaves the blocked card in the queue (no optimistic remove, no undo state)', async () => {
    // The failure mode this replaces: optimistically remove the card, fire the
    // doomed request, then restore it on the error — the operator watches a
    // card vanish and reappear and can't tell whether the guest got the reply.
    await approveDirectly(draftWithBody(''));
    expect(mockQueue.optimisticallyRemove).not.toHaveBeenCalled();
    expect(mockQueue.restore).not.toHaveBeenCalled();
  });
});

// TAC-312. The gesture now refuses a blank card outright, so `onApprove` is
// never reached on that path — the screen's job shrinks to explaining why. What
// matters here is what the refusal must NOT do: it must not remove the card,
// because the operator still has to answer it. The TAC-310 bug left the card in
// state but stranded off-screen; these pin the state half.
describe('QueueScreen refusal path', () => {
  const GUEST_ID = 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';
  const MESSAGE_ID = '5f364358-db56-4f8e-9eba-661544855cd1';

  const blankDraft = (): PendingDraft => ({
    messageId: MESSAGE_ID,
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock',
    venueTimezone: null,
    guestId: GUEST_ID,
    guestDisplayName: 'Priya N.',
    guestPhoneFallback: '+15551110004',
    draftBody: '',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 120_000,
    recentContext: [],
    langfuseTraceId: null,
  });

  it('hands the card stack a refusal handler', () => {
    mockQueue.drafts = [blankDraft()];
    renderScreen();
    expect(typeof lastCardStackProps!.onRefuseApprove).toBe('function');
  });

  it('leaves the card in local state — no removal, no restore, no request', async () => {
    const draft = blankDraft();
    mockQueue.drafts = [draft];
    renderScreen();
    await act(async () => {
      lastCardStackProps!.onRefuseApprove(draft);
    });

    expect(mockQueue.optimisticallyRemove).not.toHaveBeenCalled();
    expect(mockQueue.restore).not.toHaveBeenCalled();
    expect(approveDraft).not.toHaveBeenCalled();
  });

  it('keeps the card visible in the stack after a refusal', async () => {
    const draft = blankDraft();
    mockQueue.drafts = [draft];
    renderScreen();
    await act(async () => {
      lastCardStackProps!.onRefuseApprove(draft);
    });

    expect(stackDrafts().map((d) => d.messageId)).toEqual([MESSAGE_ID]);
  });
});

// Heads-up cards (TAC-364). The stack is mocked to null here, so these drive the
// screen's handlers directly: they claim what the SCREEN does with an
// acknowledge or a decline. That a swipe on a heads-up card reaches these
// handlers, and never `onApprove`, is claimed at the gesture's own seam in
// __tests__/components/queue/queue-card-stack-routing.test.tsx.
describe('QueueScreen — heads-up cards (TAC-364)', () => {
  const DECLINE_MESSAGE_ID = '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f';
  const DECLINE_BODY = "So sorry, we can't do the cortado today after all.";

  const commitment = (
    overrides: Partial<HeadsUpCommitment> = {},
  ): HeadsUpCommitment => ({
    id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    venueId: VENUE_A,
    guestId: 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    type: 'comp',
    guest: { name: 'Sam' },
    description: 'A cortado on the house',
    code: '7K2P',
    expected_arrival: null,
    created_at: '2026-09-14T08:00:00.000Z',
    recognitionState: 'regular',
    sourceMessageId: null,
    ...overrides,
  });

  const httpError = (status: number) => ({
    ok: false as const,
    error: { kind: 'HTTP' as const, status, message: `http ${status}` },
  });

  beforeEach(() => {
    (acknowledgeCommitment as jest.Mock).mockReset();
    (acknowledgeCommitment as jest.Mock).mockResolvedValue({ ok: true, data: undefined });
    (declineCommitment as jest.Mock).mockReset();
    (declineCommitment as jest.Mock).mockResolvedValue({
      ok: true,
      data: { messageId: DECLINE_MESSAGE_ID, body: DECLINE_BODY },
    });
    (mockQueue.optimisticallyRemoveCommitment as jest.Mock).mockClear();
    (mockQueue.restoreCommitment as jest.Mock).mockClear();
    mockRouterPush.mockClear();
    __resetDeclineHandoffForTests();
  });

  it('puts heads-up cards on the deck, ahead of drafts', () => {
    mockQueue.commitments = [commitment()];
    mockQueue.drafts = [draftWithTone()];
    renderScreen();
    expect(lastCardStackProps!.items.map((item: QueueItem) => item.kind)).toEqual([
      'headsUp',
      'draft',
    ]);
  });

  it('acknowledging sends nothing to the guest', async () => {
    const c = commitment();
    mockQueue.commitments = [c];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onAcknowledge(c);
    });
    expect(acknowledgeCommitment).toHaveBeenCalledWith(c.id);
    expect(approveDraft).not.toHaveBeenCalled();
    expect(declineCommitment).not.toHaveBeenCalled();
    expect(mockQueue.optimisticallyRemoveCommitment).toHaveBeenCalledWith(c.id);
    expect(mockQueue.restoreCommitment).not.toHaveBeenCalled();
  });

  it('puts the card back when the acknowledge fails', async () => {
    (acknowledgeCommitment as jest.Mock).mockResolvedValue(httpError(500));
    const c = commitment();
    mockQueue.commitments = [c];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onAcknowledge(c);
    });
    expect(mockQueue.restoreCommitment).toHaveBeenCalledWith(c);
  });

  it('does not put back a card that was already handled somewhere else', async () => {
    (acknowledgeCommitment as jest.Mock).mockResolvedValue(httpError(409));
    const c = commitment();
    mockQueue.commitments = [c];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onAcknowledge(c);
    });
    expect(mockQueue.optimisticallyRemoveCommitment).toHaveBeenCalledWith(c.id);
    expect(mockQueue.restoreCommitment).not.toHaveBeenCalled();
  });

  it('declining opens the written draft for review and sends nothing', async () => {
    const c = commitment();
    mockQueue.commitments = [c];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onDecline(c);
    });
    expect(declineCommitment).toHaveBeenCalledWith(c.id);
    expect(approveDraft).not.toHaveBeenCalled();
    expect(acknowledgeCommitment).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/queue/edit',
      params: {
        messageId: DECLINE_MESSAGE_ID,
        prefill: DECLINE_BODY,
        tone: HEADS_UP_TONE,
      },
    });
    expect(mockQueue.optimisticallyRemoveCommitment).toHaveBeenCalledWith(c.id);
  });

  it('stages the decline draft so the takeover renders it before the queue reloads', async () => {
    const c = commitment();
    mockQueue.commitments = [c];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onDecline(c);
    });
    expect(peekDeclineHandoff(DECLINE_MESSAGE_ID)).toMatchObject({
      messageId: DECLINE_MESSAGE_ID,
      draftBody: DECLINE_BODY,
      venueId: c.venueId,
      guestId: c.guestId,
      guestDisplayName: 'Sam',
    });
  });

  it('stays put, card and all, when the decline could not be written', async () => {
    (declineCommitment as jest.Mock).mockResolvedValue(httpError(502));
    const c = commitment();
    mockQueue.commitments = [c];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onDecline(c);
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockQueue.optimisticallyRemoveCommitment).not.toHaveBeenCalled();
    expect(peekDeclineHandoff(DECLINE_MESSAGE_ID)).toBeNull();
  });

  it('clears a card another device already declined, without opening anything', async () => {
    (declineCommitment as jest.Mock).mockResolvedValue(httpError(409));
    const c = commitment();
    mockQueue.commitments = [c];
    renderScreen();
    await act(async () => {
      await lastCardStackProps!.onDecline(c);
    });
    expect(mockQueue.optimisticallyRemoveCommitment).toHaveBeenCalledWith(c.id);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('surfaces the tapped commitment, not a draft for the same guest', () => {
    const tapped = commitment();
    const other = commitment({
      id: '77a0d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e',
      guestId: 'ff77d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e',
    });
    mockQueue.commitments = [other, tapped];
    mockQueue.drafts = [draftWithTone({ guestId: tapped.guestId })];
    setPendingTap({
      kind: 'commitment',
      guestId: tapped.guestId,
      commitmentId: tapped.id,
    });
    renderScreen();
    expect(lastCardStackProps!.items[0]).toMatchObject({
      kind: 'headsUp',
      commitment: { id: tapped.id },
    });
  });
});
