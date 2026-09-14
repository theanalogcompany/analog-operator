import { act, renderHook } from '@testing-library/react-native';
import {
  type GestureStateChangeEvent,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';

import { resolveSwipeOutcome, useQueueSwipe } from '@/hooks/use-queue-swipe';
import { swipe } from '@/lib/theme';

// TAC-312. The gesture layer had zero coverage: TAC-310's screen tests drove
// `onApprove` directly with QueueCardStack mocked to () => null, so "swipe-right
// is blocked on a blank card" was never actually exercised. The request was
// blocked; the gesture completed anyway and flew the card off the stack.
//
// `resolveSwipeOutcome` is the decision that bug lived in, extracted so it can
// be tested without driving a real pan.

const COMMIT_PX = swipe.commitThresholdPx; // 80
const FLICK_PX_S = swipe.velocityCommitPxPerSec; // 800

function outcome(
  translationX: number,
  velocityX: number,
  canCommitRight: boolean,
) {
  return resolveSwipeOutcome({ translationX, velocityX, canCommitRight });
}

describe('resolveSwipeOutcome — right swipe on a sendable card', () => {
  it('commits on distance', () => {
    expect(outcome(COMMIT_PX + 1, 0, true)).toBe('right');
  });

  it('commits on a fast flick that barely moved', () => {
    expect(outcome(5, FLICK_PX_S + 1, true)).toBe('right');
  });
});

describe('resolveSwipeOutcome — right swipe on a blank card', () => {
  it('refuses a distance commit instead of sending', () => {
    expect(outcome(COMMIT_PX + 1, 0, false)).toBe('refuse-right');
  });

  it('refuses a long drag well past the threshold', () => {
    expect(outcome(300, 0, false)).toBe('refuse-right');
  });

  it('refuses a fast flick — velocity must not sneak past the guard', () => {
    // The path most likely to be missed: distance is under threshold, so only
    // the velocity branch commits. Both branches have to route to refusal.
    expect(outcome(5, FLICK_PX_S + 1, false)).toBe('refuse-right');
  });

  it('refuses a zero-displacement flick, whose direction comes from velocity', () => {
    expect(outcome(0, FLICK_PX_S + 1, false)).toBe('refuse-right');
  });

  it('still returns (not refuses) a short drag — nothing was attempted', () => {
    // A refusal owes the operator a toast and a haptic; an ordinary short drag
    // owes them nothing. Conflating the two would fire a warning buzz on every
    // stray touch.
    expect(outcome(COMMIT_PX - 1, 0, false)).toBe('return');
  });
});

describe('resolveSwipeOutcome — left swipe', () => {
  it('commits on distance regardless of canCommitRight', () => {
    expect(outcome(-(COMMIT_PX + 1), 0, true)).toBe('left');
    expect(outcome(-(COMMIT_PX + 1), 0, false)).toBe('left');
  });

  it('is never refused on a blank card — the composer is exactly where it leads', () => {
    expect(outcome(-300, -1200, false)).toBe('left');
  });

  it('commits on a fast leftward flick', () => {
    expect(outcome(-5, -(FLICK_PX_S + 1), false)).toBe('left');
  });
});

describe('resolveSwipeOutcome — no commit', () => {
  it('returns when neither threshold is crossed', () => {
    expect(outcome(10, 100, true)).toBe('return');
    expect(outcome(-10, -100, true)).toBe('return');
  });

  it('treats the thresholds as strict — exactly at the line does not commit', () => {
    expect(outcome(COMMIT_PX, 0, true)).toBe('return');
    expect(outcome(0, FLICK_PX_S, true)).toBe('return');
  });

  it('returns on a dead release with no movement and no velocity', () => {
    expect(outcome(0, 0, true)).toBe('return');
    expect(outcome(0, 0, false)).toBe('return');
  });
});

// TAC-388. A card sat 0.3° clockwise before it had ever been swiped, and sprang
// back to 0.3° after every swipe that didn't commit: `residualRotationDeg` was
// the rest pose, inherited from the prototype. These run the real hook and drive
// the pan's own callbacks, so they read the values the card is drawn with.
describe('useQueueSwipe: the card at rest (TAC-388)', () => {
  type UpdateEvent = GestureUpdateEvent<PanGestureHandlerEventPayload>;
  type EndEvent = GestureStateChangeEvent<PanGestureHandlerEventPayload>;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mount(canCommitRight = true) {
    const { result } = renderHook(() =>
      useQueueSwipe({
        onCommitRight: jest.fn(),
        onCommitLeft: jest.fn(),
        onRefuseRight: jest.fn(),
        onCrossThreshold: jest.fn(),
        canCommitRight,
        enabled: true,
      }),
    );
    return result;
  }

  it('rests at zero rotation', () => {
    expect(swipe.residualRotationDeg).toBe(0);
  });

  it('mounts square and centred, before any swipe', () => {
    const result = mount();
    expect(result.current.rotation.value).toBe(0);
    expect(result.current.translateX.value).toBe(0);
  });

  it.each([
    ['a short drag', 30, true],
    ['a left swipe', -(COMMIT_PX + 1), true],
    ['a refused right swipe on a blank draft', COMMIT_PX + 1, false],
  ])('settles square after %s', (_label, translationX, canCommitRight) => {
    const result = mount(canCommitRight);
    const { onUpdate, onEnd } = result.current.pan.handlers;
    if (!onUpdate || !onEnd) throw new Error('the pan has no update or end callback');

    act(() => {
      onUpdate({ translationX } as unknown as UpdateEvent);
    });
    // Guards the guard: the drag has to have tilted the card, or "settles to
    // zero" would pass on a card that never moved.
    expect(result.current.rotation.value).not.toBe(0);

    act(() => {
      onEnd({ translationX, velocityX: 0 } as unknown as EndEvent, true);
    });
    // The spring-back is a timing animation; let it land.
    act(() => {
      jest.advanceTimersByTime(swipe.springBackDurationMs + 100);
    });
    expect(result.current.rotation.value).toBe(0);
    expect(result.current.translateX.value).toBe(0);
  });
});
