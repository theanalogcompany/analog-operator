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
  onCommitRight: () => void;
  onCommitLeft: () => void;
  /** Fires when a right-commit was declined because `canCommitRight` is false. */
  onRefuseRight: () => void;
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
  canCommitRight,
  enabled,
}: UseQueueSwipeArgs): UseQueueSwipeResult {
  const translateX = useSharedValue<number>(0);
  const rotation = useSharedValue<number>(swipe.residualRotationDeg);
  const direction = useSharedValue<SwipeDirection>(0);
  const intensity = useSharedValue<number>(0);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      'worklet';
      if (__DEV__) console.log('[pan] begin');
    })
    .onUpdate((e) => {
      'worklet';
      if (__DEV__) console.log('[pan] update', e.translationX);
      translateX.value = e.translationX;
      rotation.value = e.translationX * swipe.rotationFactor;
      const abs = Math.abs(e.translationX);
      intensity.value = Math.min(1, abs / swipe.intensityDivisorPx);
      direction.value = e.translationX > 0 ? 1 : e.translationX < 0 ? -1 : 0;
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
        translateX.value = withTiming(swipe.flyOffTranslateXPx, {
          duration: swipe.flyOffDurationMs,
        });
        rotation.value = withTiming(swipe.flyOffRotationDeg, {
          duration: swipe.flyOffDurationMs,
        });
        intensity.value = withTiming(0, { duration: swipe.flyOffDurationMs });
        runOnJS(onCommitRight)();
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

      if (outcome === 'left') {
        runOnJS(onCommitLeft)();
      } else if (outcome === 'refuse-right') {
        runOnJS(onRefuseRight)();
      }
    });

  return { pan, translateX, rotation, direction, intensity };
}
