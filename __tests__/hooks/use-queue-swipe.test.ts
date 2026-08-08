import { resolveSwipeOutcome } from '@/hooks/use-queue-swipe';
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
