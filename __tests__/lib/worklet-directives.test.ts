import { isComposerTap, peekOpacity } from '@/components/queue/queue-card-stack';
import { hintState } from '@/components/queue/swipe-hints';
import { washOpacity } from '@/components/queue/swipe-overlay';
import { resolveSwipeOutcome } from '@/hooks/use-queue-swipe';

/**
 * Every helper called from inside a worklet must itself be a worklet.
 *
 * This exists because `washOpacity` shipped without its `'worklet'` directive
 * and took down a TestFlight build on launch. The behavioral tests for it all
 * passed — Jest runs it as ordinary JS, so they proved the arithmetic and said
 * nothing about the thread it has to run on. The crash was release-only,
 * because that is the only place `useAnimatedStyle` genuinely executes on the
 * UI thread.
 *
 * `__workletHash` is attached by the Reanimated babel plugin when it
 * workletizes a function, so its presence is a mechanical check that the
 * directive survived — one that cannot be satisfied by a function that merely
 * returns the right number.
 *
 * ADD TO THIS LIST whenever you extract a helper that a `useAnimatedStyle`,
 * a gesture callback, or an animation callback will call.
 */
const workletHelpers = {
  // Drives the swipe wash opacity from inside useAnimatedStyle.
  washOpacity,
  // Drives hint growth and dimming from inside useAnimatedStyle.
  hintState,
  // Drives peek-card opacity from inside useAnimatedStyle.
  peekOpacity,
  // Called from the Tap gesture's onEnd, on the UI thread.
  isComposerTap,
  // Called from the Pan gesture's onEnd, on the UI thread.
  resolveSwipeOutcome,
} as const;

describe('worklet directives', () => {
  it.each(Object.keys(workletHelpers))(
    '%s is workletized, not just correct',
    (name) => {
      const fn = workletHelpers[name as keyof typeof workletHelpers];
      expect(typeof fn).toBe('function');
      expect(fn).toHaveProperty('__workletHash');
    },
  );

  it('covers every helper, so the list cannot silently fall behind', () => {
    // A reminder rather than a real constraint: if you extracted a new helper
    // and did not add it above, this count is the thing that nags you.
    expect(Object.keys(workletHelpers)).toHaveLength(5);
  });
});
