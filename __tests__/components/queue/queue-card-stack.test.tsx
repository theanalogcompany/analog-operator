import { render } from '@testing-library/react-native';

import { QueueCardStack } from '@/components/queue/queue-card-stack';
import { type PendingDraft } from '@/lib/api/queue';
import { type UseQueueSwipeArgs } from '@/hooks/use-queue-swipe';

// TAC-312. The screen tests mock QueueCardStack away entirely, so nothing there
// can see what the stack hands the gesture. This suite tests exactly that seam:
// the value of `canCommitRight` per draft, and which callback each gesture
// outcome routes to. `useQueueSwipe` itself is stubbed so the captured args are
// inspectable without driving a real pan — the decision logic it wraps is
// covered directly in __tests__/hooks/use-queue-swipe.test.ts.
const mockSwipe: { args: UseQueueSwipeArgs | null } = { args: null };

jest.mock('@/hooks/use-queue-swipe', () => {
  const { Gesture } = require('react-native-gesture-handler');
  const { useSharedValue } = require('react-native-reanimated');
  return {
    useQueueSwipe: (args: UseQueueSwipeArgs) => {
      mockSwipe.args = args;
      return {
        pan: Gesture.Pan(),
        translateX: useSharedValue(0),
        rotation: useSharedValue(0),
        direction: useSharedValue(0),
        intensity: useSharedValue(0),
      };
    },
  };
});

const mockHaptics = {
  swipeRightSuccess: jest.fn(),
  swipeRefused: jest.fn(),
  swipeLeftEdit: jest.fn(),
  undoTriggered: jest.fn(),
};
jest.mock('@/hooks/use-haptics', () => ({
  useHaptics: () => mockHaptics,
}));

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    venueTimezone: null,
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
    recentContext: [],
    langfuseTraceId: null,
    ...overrides,
  };
}

const handlers = {
  onApprove: jest.fn(),
  onEdit: jest.fn(),
  onRefuseApprove: jest.fn(),
};

function renderStack(draft: PendingDraft) {
  return render(<QueueCardStack drafts={[draft]} {...handlers} />);
}

beforeEach(() => {
  mockSwipe.args = null;
  handlers.onApprove.mockClear();
  handlers.onEdit.mockClear();
  handlers.onRefuseApprove.mockClear();
  mockHaptics.swipeRightSuccess.mockClear();
  mockHaptics.swipeRefused.mockClear();
  mockHaptics.swipeLeftEdit.mockClear();
});

describe('QueueCardStack — canCommitRight', () => {
  it('is false for a blank draft, so the gesture refuses instead of flying off', () => {
    renderStack(makeDraft({ draftBody: '' }));
    expect(mockSwipe.args?.canCommitRight).toBe(false);
  });

  it('is false for a whitespace-only draft', () => {
    renderStack(makeDraft({ draftBody: '  \n ' }));
    expect(mockSwipe.args?.canCommitRight).toBe(false);
  });

  it('is true for a draft with real text', () => {
    renderStack(makeDraft());
    expect(mockSwipe.args?.canCommitRight).toBe(true);
  });
});

describe('QueueCardStack — outcome routing', () => {
  it('routes a refusal to onRefuseApprove, never to onApprove', () => {
    const draft = makeDraft({ draftBody: '' });
    renderStack(draft);
    mockSwipe.args!.onRefuseRight();

    expect(handlers.onRefuseApprove).toHaveBeenCalledWith(draft);
    expect(handlers.onApprove).not.toHaveBeenCalled();
  });

  it('fires the warning haptic on refusal, not the success one', () => {
    // A refused action that buzzes "success" is the same lie the fly-off told.
    renderStack(makeDraft({ draftBody: '' }));
    mockSwipe.args!.onRefuseRight();

    expect(mockHaptics.swipeRefused).toHaveBeenCalled();
    expect(mockHaptics.swipeRightSuccess).not.toHaveBeenCalled();
  });

  it('routes a real right-commit to onApprove with the success haptic', () => {
    const draft = makeDraft();
    renderStack(draft);
    mockSwipe.args!.onCommitRight();

    expect(handlers.onApprove).toHaveBeenCalledWith(draft);
    expect(mockHaptics.swipeRightSuccess).toHaveBeenCalled();
    expect(handlers.onRefuseApprove).not.toHaveBeenCalled();
  });

  it('routes a left-commit to onEdit even on a blank card', () => {
    const draft = makeDraft({ draftBody: '' });
    renderStack(draft);
    mockSwipe.args!.onCommitLeft();

    expect(handlers.onEdit).toHaveBeenCalledWith(draft);
    expect(mockHaptics.swipeLeftEdit).toHaveBeenCalled();
  });
});
