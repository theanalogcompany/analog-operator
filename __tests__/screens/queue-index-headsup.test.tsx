// CRITICAL no-send guard tests for heads-up cards (TAC-298).
//
// The heads-up card shares the draft-card chassis, so the swipe-action
// routing on `QueueScreen` MUST branch by card type to prevent a regression
// where a swipe-right on a heads-up card accidentally calls `approveDraft`
// (which texts the guest via Sendblue) or `editAndSend` (same). These tests
// mock all four mutating API client functions, simulate the swipe-action
// handlers via the `QueueCardStack` props, and assert ONLY the expected one
// fires per gesture direction. (TAC-298 ticket Notes for Claude Code.)

import { act, render } from '@testing-library/react-native';

import QueueScreen from '@/app/queue/index';
import { type UseQueueResult } from '@/hooks/use-queue';
import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { acknowledgeCommitment, declineDraft } from '@/lib/api/commitments';
import { approveDraft, editAndSend } from '@/lib/api/queue';
import { __resetTapStateForTests } from '@/lib/notifications/tap-handler';
import { type QueueCard } from '@/lib/queue/cards';

jest.mock('@/lib/api/commitments', () => {
  const actual = jest.requireActual('@/lib/api/commitments');
  return {
    ...actual,
    acknowledgeCommitment: jest.fn(),
    declineDraft: jest.fn(),
  };
});
jest.mock('@/lib/api/queue', () => {
  const actual = jest.requireActual('@/lib/api/queue');
  return {
    ...actual,
    approveDraft: jest.fn(),
    editAndSend: jest.fn(),
  };
});

const approveDraftMock = approveDraft as jest.Mock;
const editAndSendMock = editAndSend as jest.Mock;
const acknowledgeCommitmentMock = acknowledgeCommitment as jest.Mock;
const declineDraftMock = declineDraft as jest.Mock;

const mockRouterPush = jest.fn();

type DraftHandlers = {
  onApprove: (draft: { messageId: string }) => void;
  onEdit: (draft: { messageId: string }) => void;
};
type HeadsUpHandlers = {
  onAcknowledge: (commitment: HeadsUpCommitment) => void;
  onDecline: (commitment: HeadsUpCommitment) => void;
};
type CardStackProps = {
  cards: QueueCard[];
  draftHandlers: DraftHandlers;
  headsUpHandlers: HeadsUpHandlers;
};
let lastCardStackProps: CardStackProps | null = null;

const commitment: HeadsUpCommitment = {
  id: 'aabbccdd-1111-4222-8333-444455556666',
  type: 'comp',
  guestName: 'Maya',
  description: 'oat latte',
  code: '7K2P',
  expectedArrival: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  recognitionState: 'returning',
  sourceMessageId: null,
};

const mockQueue: UseQueueResult = {
  drafts: [],
  commitments: [commitment],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemoveDraft: jest.fn(),
  restoreDraft: jest.fn(),
  optimisticallyRemoveCommitment: jest.fn(),
  restoreCommitment: jest.fn(),
};

const mockSession = {
  status: 'signed-in' as const,
  session: { user: { email: 'op@theanalog.company' } },
};

jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
  openSettings: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));
jest.mock('@/app/queue/_layout', () => ({ useQueueContext: () => mockQueue }));
jest.mock('@/lib/auth/use-session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { signOut: jest.fn() } },
}));
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
jest.mock('@/components/queue/empty-state', () => ({ EmptyState: () => null }));
jest.mock('@/components/auth/toast', () => ({
  showToast: jest.fn(),
}));

beforeEach(() => {
  approveDraftMock.mockReset();
  editAndSendMock.mockReset();
  acknowledgeCommitmentMock.mockReset();
  declineDraftMock.mockReset();
  acknowledgeCommitmentMock.mockResolvedValue({ ok: true, data: undefined });
  declineDraftMock.mockResolvedValue({
    ok: true,
    data: { messageId: '550e8400-e29b-41d4-a716-446655440000' },
  });
  mockRouterPush.mockReset();
  (mockQueue.optimisticallyRemoveCommitment as jest.Mock).mockReset();
  (mockQueue.restoreCommitment as jest.Mock).mockReset();
  (mockQueue.reload as jest.Mock).mockReset();
  lastCardStackProps = null;
  __resetTapStateForTests();
});

describe('Heads-up card no-send guard (swipe-right = acknowledge ONLY)', () => {
  it('swipe-right on a heads-up card calls acknowledgeCommitment and NEVER approveDraft / editAndSend / declineDraft', async () => {
    render(<QueueScreen />);
    expect(lastCardStackProps).not.toBeNull();
    await act(async () => {
      lastCardStackProps!.headsUpHandlers.onAcknowledge(commitment);
    });
    expect(acknowledgeCommitmentMock).toHaveBeenCalledTimes(1);
    expect(acknowledgeCommitmentMock).toHaveBeenCalledWith(commitment.id);
    // The whole point: heads-up swipe-right MUST NOT touch the send path.
    expect(approveDraftMock).not.toHaveBeenCalled();
    expect(editAndSendMock).not.toHaveBeenCalled();
    expect(declineDraftMock).not.toHaveBeenCalled();
    // And MUST NOT navigate (acknowledge clears the card; no edit screen).
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('removes the commitment optimistically on swipe-right success', async () => {
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.headsUpHandlers.onAcknowledge(commitment);
    });
    expect(mockQueue.optimisticallyRemoveCommitment).toHaveBeenCalledWith(
      commitment.id,
    );
    expect(mockQueue.restoreCommitment).not.toHaveBeenCalled();
  });

  it('restores the commitment on swipe-right failure', async () => {
    acknowledgeCommitmentMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'oops' },
    });
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.headsUpHandlers.onAcknowledge(commitment);
    });
    expect(mockQueue.restoreCommitment).toHaveBeenCalledWith(commitment);
  });
});

describe('Heads-up card no-send guard (swipe-left = decline draft ONLY, never direct send)', () => {
  it('swipe-left on a heads-up card calls declineDraft and NEVER approveDraft / editAndSend / acknowledge', async () => {
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.headsUpHandlers.onDecline(commitment);
    });
    expect(declineDraftMock).toHaveBeenCalledTimes(1);
    expect(declineDraftMock).toHaveBeenCalledWith(commitment.id);
    // The whole point: heads-up swipe-left MUST NOT touch the send path
    // directly — draft-decline persists-not-sends server-side, the operator
    // sends explicitly from the edit screen.
    expect(approveDraftMock).not.toHaveBeenCalled();
    expect(editAndSendMock).not.toHaveBeenCalled();
    expect(acknowledgeCommitmentMock).not.toHaveBeenCalled();
  });

  it('routes to /queue/edit with the returned messageId on swipe-left success', async () => {
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.headsUpHandlers.onDecline(commitment);
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/queue/edit',
      params: { messageId: '550e8400-e29b-41d4-a716-446655440000' },
    });
  });

  it('on 409 invalid_state, does NOT restore (commitment is already cancelled server-side) and reloads', async () => {
    declineDraftMock.mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'HTTP',
        status: 409,
        message: '{"error":"invalid_state"}',
      },
    });
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.headsUpHandlers.onDecline(commitment);
    });
    expect(mockQueue.restoreCommitment).not.toHaveBeenCalled();
    expect(mockQueue.reload).toHaveBeenCalledTimes(1);
    // And no navigation to edit screen — there's no decline draft to edit.
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('on other failures, restores the commitment and does NOT navigate', async () => {
    declineDraftMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'boom' },
    });
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.headsUpHandlers.onDecline(commitment);
    });
    expect(mockQueue.restoreCommitment).toHaveBeenCalledWith(commitment);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

describe('Plain draft swipe path — regression guard for the useQueue rename', () => {
  // Per the operator's Note #2 on the locked plan: the useQueue rename
  // touches the existing draft flow — make sure swipe-right/swipe-left on
  // a draft card still calls the right thing.
  const draft = {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'A',
    guestPhoneFallback: '+15550001',
    draftBody: 'body',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 60_000,
    recentContext: [],
    langfuseTraceId: null,
  };

  it('swipe-right on a draft card calls approveDraft and NEVER acknowledgeCommitment/declineDraft', async () => {
    mockQueue.drafts = [draft];
    mockQueue.commitments = [];
    approveDraftMock.mockResolvedValueOnce({ ok: true, data: undefined });
    render(<QueueScreen />);
    await act(async () => {
      lastCardStackProps!.draftHandlers.onApprove(draft);
    });
    expect(approveDraftMock).toHaveBeenCalledWith(draft.messageId);
    expect(acknowledgeCommitmentMock).not.toHaveBeenCalled();
    expect(declineDraftMock).not.toHaveBeenCalled();
    // Reset for the next test in this block.
    mockQueue.drafts = [];
    mockQueue.commitments = [commitment];
  });

  it('swipe-left on a draft card routes to /queue/edit with messageId and NEVER calls declineDraft', () => {
    mockQueue.drafts = [draft];
    mockQueue.commitments = [];
    render(<QueueScreen />);
    act(() => {
      lastCardStackProps!.draftHandlers.onEdit(draft);
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/queue/edit',
      params: { messageId: draft.messageId },
    });
    expect(declineDraftMock).not.toHaveBeenCalled();
    // Reset.
    mockQueue.drafts = [];
    mockQueue.commitments = [commitment];
  });
});
