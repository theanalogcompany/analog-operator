import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import QueueScreen from '@/app/queue/index';
import { type UseQueueResult } from '@/hooks/use-queue';
import {
  __resetTapStateForTests,
  setPendingTap,
} from '@/lib/notifications/tap-handler';
import { type QueueCard } from '@/lib/queue/cards';

type DraftHandlers = {
  onApprove: (draft: { messageId: string; guestId: string }) => void;
  onEdit: (draft: { messageId: string; guestId: string }) => void;
};
type HeadsUpHandlers = {
  onAcknowledge: (commitment: { id: string }) => void;
  onDecline: (commitment: { id: string }) => void;
};
type CardStackProps = {
  cards: QueueCard[];
  draftHandlers: DraftHandlers;
  headsUpHandlers: HeadsUpHandlers;
};
let lastCardStackProps: CardStackProps | null = null;

type SessionStub = { status: 'signed-in'; session: { user: { email: string | null } } };

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

let mockSession: SessionStub = {
  status: 'signed-in',
  session: { user: { email: 'jaipal@theanalog.company' } },
};

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
  openSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/app/queue/_layout', () => ({ useQueueContext: () => mockQueue }));
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
  lastCardStackProps = null;
  __resetTapStateForTests();
});

describe('QueueScreen header surface', () => {
  it('renders the new wordmark and hides the legacy header', () => {
    render(<QueueScreen />);
    expect(screen.getByText('the analog company')).toBeTruthy();
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

  it('renders the queue + need-your-input meta row (no sent-today segment)', () => {
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
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('in queue')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('need your input')).toBeTruthy();
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

  const guestIdOfCard = (c: QueueCard): string =>
    c.type === 'draft_review' ? c.draft.guestId : '';

  it('surfaces the pushed guest on top of the FIFO stack on mount', () => {
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(THIRD_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(TARGET_GUEST_ID, '33a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    setPendingTap({ guestId: TARGET_GUEST_ID, commitmentId: null });
    render(<QueueScreen />);
    expect(lastCardStackProps).not.toBeNull();
    expect(guestIdOfCard(lastCardStackProps!.cards[0])).toBe(TARGET_GUEST_ID);
    expect(lastCardStackProps!.cards.map(guestIdOfCard)).toEqual([
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
    setPendingTap({ guestId: TARGET_GUEST_ID, commitmentId: null }); // not in drafts
    render(<QueueScreen />);
    expect(lastCardStackProps!.cards.map(guestIdOfCard)).toEqual([
      OTHER_GUEST_ID,
      THIRD_GUEST_ID,
    ]);
  });

  it('restores natural FIFO order after the surfaced card is approved', () => {
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      draftFor(TARGET_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    setPendingTap({ guestId: TARGET_GUEST_ID, commitmentId: null });
    render(<QueueScreen />);
    expect(guestIdOfCard(lastCardStackProps!.cards[0])).toBe(TARGET_GUEST_ID);

    // Simulate the operator approving the surfaced card. The screen calls
    // optimisticallyRemoveDraft (no-op mock here — we control drafts directly)
    // and clears the pending tap. We assert by feeding new drafts and
    // re-rendering: natural FIFO order should be honored.
    act(() => {
      lastCardStackProps!.draftHandlers.onApprove(
        draftFor(TARGET_GUEST_ID, '22a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
      );
    });

    // Reflect the optimistic removal in the mock queue.
    mockQueue.drafts = [
      draftFor(OTHER_GUEST_ID, '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d'),
    ];
    render(<QueueScreen />);
    expect(lastCardStackProps!.cards.map(guestIdOfCard)).toEqual([
      OTHER_GUEST_ID,
    ]);
  });
});
