import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import QueueScreen from '@/app/queue/index';
import { type UseQueueResult } from '@/hooks/use-queue';
import { clearUndoState } from '@/hooks/use-undo-state';
import { type PendingDraft, approveDraft } from '@/lib/api/queue';
import {
  __resetTapStateForTests,
  setPendingTap,
} from '@/lib/notifications/tap-handler';

type CardStackProps = {
  drafts: PendingDraft[];
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
  onRefuseApprove: (draft: PendingDraft) => void;
};
let lastCardStackProps: CardStackProps | null = null;

type SessionStub = { status: 'signed-in'; session: { user: { email: string | null } } };

const mockQueue: UseQueueResult = {
  drafts: [],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
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
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/queue',
}));
jest.mock('@/lib/queue-context', () => ({ useQueueContext: () => mockQueue }));
jest.mock('@/lib/auth/use-session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('@/components/queue/queue-card-stack', () => ({
  QueueCardStack: (props: CardStackProps) => {
    lastCardStackProps = props;
    return null;
  },
}));
jest.mock('@/components/queue/permission-denied-banner', () => ({
  PermissionDeniedBanner: () => null,
}));
jest.mock('@/components/queue/undo-toast', () => ({ UndoToast: () => null }));
jest.mock('@/lib/api/queue', () => {
  const actual = jest.requireActual('@/lib/api/queue');
  return {
    ...actual,
    approveDraft: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
    undoAction: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
});
jest.mock('@/components/queue/empty-state', () => {
  const { Text } = jest.requireActual('react-native');
  return { EmptyState: () => <Text>empty-state-mock</Text> };
});

beforeEach(() => {
  mockQueue.drafts = [];
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

describe('QueueScreen header surface', () => {
  it('renders the logo and hides the legacy header', () => {
    render(<QueueScreen />);
    expect(screen.getByLabelText('Analog')).toBeTruthy();
    expect(screen.queryByText(/PENDING/)).toBeNull();
  });

  it('renders the greeting with the operator first name derived from email', () => {
    render(<QueueScreen />);
    expect(screen.getByText(/Good (morning|afternoon|evening), Jaipal\./)).toBeTruthy();
  });

  it('falls back to a nameless greeting when email is null', () => {
    mockSession = {
      status: 'signed-in',
      session: { user: { email: null } },
    };
    render(<QueueScreen />);
    expect(screen.getByText(/Good (morning|afternoon|evening)\./)).toBeTruthy();
  });

  it('renders the drafts + need-your-input meta row (no sent-today segment)', () => {
    mockQueue.drafts = [
      {
        messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueSlug: 'mock',
        guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        guestDisplayName: 'A',
        guestPhoneFallback: '+15550001',
        draftBody: 'x',
        category: null,
        voiceFidelity: null,
        reviewReason: 'low fidelity',
        recognitionState: null,
        agentReasoning: null,
        pendingSinceMs: 1,
        recentContext: [],
        langfuseTraceId: null,
      },
      {
        messageId: '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        venueSlug: 'mock',
        guestId: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
        guestDisplayName: 'B',
        guestPhoneFallback: '+15550002',
        draftBody: 'y',
        category: null,
        voiceFidelity: null,
        reviewReason: null,
        recognitionState: null,
        agentReasoning: null,
        pendingSinceMs: 1,
        recentContext: [],
        langfuseTraceId: null,
      },
    ];
    render(<QueueScreen />);
    // Scoped to the meta row: QueueTabsHeader (rendered above it) also shows
    // a live queue count, and with 2 drafts here that count coincides with
    // this row's draftCount — an unscoped getByText('2') would be ambiguous.
    const metaRow = within(screen.getByTestId('queue-meta-row'));
    expect(metaRow.getByText('2')).toBeTruthy();
    expect(metaRow.getByText('drafts')).toBeTruthy();
    expect(metaRow.getByText('1')).toBeTruthy();
    expect(metaRow.getByText('need your input')).toBeTruthy();
    expect(screen.queryByText(/sent today/)).toBeNull();
  });

  it('renders the footer copy', () => {
    render(<QueueScreen />);
    expect(screen.getByText(/Need help\?/)).toBeTruthy();
    expect(screen.getByText('Chat with Jaipal')).toBeTruthy();
  });

  it('opens the help SMS link when "Chat with Jaipal" is pressed', () => {
    render(<QueueScreen />);
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
    setPendingTap(TARGET_GUEST_ID);
    render(<QueueScreen />);
    expect(lastCardStackProps).not.toBeNull();
    expect(lastCardStackProps!.drafts[0].guestId).toBe(TARGET_GUEST_ID);
    expect(lastCardStackProps!.drafts.map((d) => d.guestId)).toEqual([
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
    setPendingTap(TARGET_GUEST_ID); // not in drafts
    render(<QueueScreen />);
    expect(lastCardStackProps!.drafts.map((d) => d.guestId)).toEqual([
      OTHER_GUEST_ID,
      THIRD_GUEST_ID,
    ]);
  });

  it('restores natural FIFO order after the surfaced card is approved', () => {
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(TARGET_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    setPendingTap(TARGET_GUEST_ID);
    render(<QueueScreen />);
    expect(lastCardStackProps!.drafts[0].guestId).toBe(TARGET_GUEST_ID);

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
    render(<QueueScreen />);
    expect(lastCardStackProps!.drafts.map((d) => d.guestId)).toEqual([
      OTHER_GUEST_ID,
    ]);
  });
});

// TAC-310. Swipe-right is the second of the two send entry points, and it was
// the one that produced the 422 empty_body: `/approve` carries no request body,
// so the server ships whatever draft body it has stored — and for a card whose
// draft was never generated, that's `""`. The card looked sendable, the swipe
// looked like it worked, and nothing shipped. These lock the local block.
describe('QueueScreen swipe-right send path', () => {
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

  async function swipeRight(draft: PendingDraft): Promise<void> {
    mockQueue.drafts = [draft];
    render(<QueueScreen />);
    await act(async () => {
      await lastCardStackProps!.onApprove(draft);
    });
  }

  it('sends when the draft body is present', async () => {
    await swipeRight(draftWithBody('Patio is open until 9 — come by.'));
    expect(approveDraft).toHaveBeenCalledWith(MESSAGE_ID);
    expect(mockQueue.optimisticallyRemove).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('blocks locally on a genuinely-empty draft — no network call', async () => {
    await swipeRight(draftWithBody(''));
    expect(approveDraft).not.toHaveBeenCalled();
  });

  it('blocks locally on a whitespace-only draft — no network call', async () => {
    await swipeRight(draftWithBody('   \n  '));
    expect(approveDraft).not.toHaveBeenCalled();
  });

  it('leaves the blocked card in the queue (no optimistic remove, no undo state)', async () => {
    // The failure mode this replaces: optimistically remove the card, fire the
    // doomed request, then restore it on the error — the operator watches a
    // card vanish and reappear and can't tell whether the guest got the reply.
    await swipeRight(draftWithBody(''));
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
    render(<QueueScreen />);
    expect(typeof lastCardStackProps!.onRefuseApprove).toBe('function');
  });

  it('leaves the card in local state — no removal, no restore, no request', async () => {
    const draft = blankDraft();
    mockQueue.drafts = [draft];
    render(<QueueScreen />);
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
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.onRefuseApprove(draft);
    });

    expect(lastCardStackProps!.drafts.map((d) => d.messageId)).toEqual([MESSAGE_ID]);
  });
});
