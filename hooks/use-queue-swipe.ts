import { Gesture } from 'react-native-gesture-handler';
import {
  type SharedValue,
  runOnJS,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { swipe } from '@/lib/theme';

export type SwipeDirection = -1 | 0 | 1;

/**
 * What a finished pan should do.
 *
 * `refuse-right` is distinct from `return`: both spring the card back, but a
 * refusal means the operator DID cross the commit threshold and the gesture
 * declined, so it owes them an explanation (haptic + toast). A `return` is an
 * ordinary short drag and owes them nothing.
 */
export type SwipeOutcome = 'right' | 'left' | 'refuse-right' | 'return';

/**
 * Pure commit-decision for a finished pan.
 *
 * Split out of `onEnd` so the decision is unit-testable without driving a real
 * gesture — the whole reason TAC-312 shipped is that the gesture layer had no
 * coverage and the screen tests mocked it away. Marked `'worklet'` so the
 * UI-thread `onEnd` can call it; it stays an ordinary function on the JS
 * thread, which is what makes it directly testable.
 *
 * `canCommitRight === false` (blank draft) converts a right-commit into a
 * refusal. Left is never refused — swipe-left opens the composer, which is
 * exactly what a blank card needs.
 */
export function resolveSwipeOutcome(args: {
  translationX: number;
  velocityX: number;
  canCommitRight: boolean;
}): SwipeOutcome {
  'worklet';
  const { translationX, velocityX, canCommitRight } = args;
  const passDistance = Math.abs(translationX) > swipe.commitThresholdPx;
  const passVelocity = Math.abs(velocityX) > swipe.velocityCommitPxPerSec;
  if (!passDistance && !passVelocity) return 'return';
  // A pure flick with no displacement takes its direction from velocity.
  const directionSign =
    translationX === 0 ? Math.sign(velocityX) : Math.sign(translationX);
  if (directionSign > 0) return canCommitRight ? 'right' : 'refuse-right';
  if (directionSign < 0) return 'left';
  return 'return';
}

export type UseQueueSwipeArgs = {
  /**
   * Fires when the fly-off animation lands, not when the finger lifts — the
   * design's "the card flies to ±440px and the action fires 250ms later".
   * Dispatching it at `onEnd` instead would pop the next card in while the
   * outgoing one is still in the air.
   */
  onCommitRight: () => void;
  onCommitLeft: () => void;
  /** Fires when a right-commit was declined because `canCommitRight` is false. */
  onRefuseRight: () => void;
  /**
   * Fires once each time the drag crosses the commit threshold, in either
   * direction. Feeling the commit point before releasing is what makes an
   * invisible 80px threshold discoverable.
   */
  onCrossThreshold: () => void;
  /**
   * Whether a right-swipe may complete. False for a blank draft: the card
   * snaps back instead of flying off.
   *
   * This has to live in the gesture, not in the JS approve handler. The
   * fly-off animation and `runOnJS(onCommitRight)` are dispatched together on
   * the UI thread, so a handler that declines the send has already lost the
   * card — it animates away regardless, and nothing resets the transform
   * because a reload doesn't remount the keyed card. Refusal is only
   * expressible here. (TAC-312.)
   */
  canCommitRight: boolean;
  enabled: boolean;
};

export type UseQueueSwipeResult = {
  pan: ReturnType<typeof Gesture.Pan>;
  translateX: SharedValue<number>;
  rotation: SharedValue<number>;
  direction: SharedValue<SwipeDirection>;
  intensity: SharedValue<number>;
};

export function useQueueSwipe({
  onCommitRight,
  onCommitLeft,
  onRefuseRight,
  onCrossThreshold,
  canCommitRight,
  enabled,
}: UseQueueSwipeArgs): UseQueueSwipeResult {
  const translateX = useSharedValue<number>(0);
  const rotation = useSharedValue<number>(swipe.residualRotationDeg);
  const direction = useSharedValue<SwipeDirection>(0);
  const intensity = useSharedValue<number>(0);
  // Edge-detects the threshold so the haptic fires on crossing, not on every
  // frame spent past the line.
  const pastThreshold = useSharedValue<boolean>(false);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      'worklet';
      pastThreshold.value = false;
    })
    .onUpdate((e) => {
      'worklet';
      translateX.value = e.translationX;
      rotation.value = e.translationX * swipe.rotationFactor;
      const abs = Math.abs(e.translationX);
      intensity.value = Math.min(1, abs / swipe.intensityDivisorPx);
      direction.value = e.translationX > 0 ? 1 : e.translationX < 0 ? -1 : 0;

      const crossed = abs > swipe.commitThresholdPx;
      if (crossed !== pastThreshold.value) {
        pastThreshold.value = crossed;
        // Only on the way in. Buzzing again on the way back out would make a
        // corrected, abandoned swipe feel like it did something.
        if (crossed) runOnJS(onCrossThreshold)();
      }
    })
    .onEnd((e) => {
      'worklet';
      const outcome = resolveSwipeOutcome({
        translationX: e.translationX,
        velocityX: e.velocityX,
        canCommitRight,
      });

      // The only outcome that takes the card off the stack.
      if (outcome === 'right') {
        // The commit rides the fly-off's completion callback rather than a
        // parallel setTimeout: one clock, nothing to clear on unmount, and the
        // card is genuinely gone before the deck advances. This does not
        // reopen TAC-312 — the refusal decision above already happened on the
        // UI thread, so a card that may not send never starts flying.
        translateX.value = withTiming(
          swipe.flyOffTranslateXPx,
          { duration: swipe.flyOffDurationMs },
          (finished) => {
            'worklet';
            if (finished) runOnJS(onCommitRight)();
          },
        );
        rotation.value = withTiming(swipe.flyOffRotationDeg, {
          duration: swipe.flyOffDurationMs,
        });
        intensity.value = withTiming(0, { duration: swipe.flyOffDurationMs });
        return;
      }

      // Everything else returns the card to rest — 'left' (the composer opens
      // over a card that stays on the stack), 'refuse-right' (blank draft) and
      // 'return' (short drag) share one spring-back so a refused swipe is
      // visually indistinguishable from a swipe that never committed.
      translateX.value = withTiming(0, { duration: swipe.springBackDurationMs });
      rotation.value = withTiming(swipe.residualRotationDeg, {
        duration: swipe.springBackDurationMs,
      });
      intensity.value = withTiming(0, { duration: swipe.springBackDurationMs });
      direction.value = 0;
      pastThreshold.value = false;

      if (outcome === 'left') {
        runOnJS(onCommitLeft)();
      } else if (outcome === 'refuse-right') {
        runOnJS(onRefuseRight)();
      }
    });

  return { pan, translateX, rotation, direction, intensity };
}
