import { Gesture } from 'react-native-gesture-handler';
import {
  type SharedValue,
  runOnJS,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { swipe } from '@/lib/theme';

export type SwipeDirection = -1 | 0 | 1;

export type UseQueueSwipeArgs = {
  onCommitRight: () => void;
  onCommitLeft: () => void;
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
    .onUpdate((e) => {
      'worklet';
      translateX.value = e.translationX;
      rotation.value = e.translationX * swipe.rotationFactor;
      const abs = Math.abs(e.translationX);
      intensity.value = Math.min(1, abs / swipe.intensityDivisorPx);
      direction.value = e.translationX > 0 ? 1 : e.translationX < 0 ? -1 : 0;
    })
    .onEnd((e) => {
      'worklet';
      const dx = e.translationX;
      const vx = e.velocityX;
      const passDistance = Math.abs(dx) > swipe.commitThresholdPx;
      const passVelocity = Math.abs(vx) > swipe.velocityCommitPxPerSec;
      const commit = passDistance || passVelocity;
      const directionSign = dx === 0 ? Math.sign(vx) : Math.sign(dx);

      if (commit && directionSign > 0) {
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

      if (commit && directionSign < 0) {
        translateX.value = withTiming(0, { duration: swipe.springBackDurationMs });
        rotation.value = withTiming(swipe.residualRotationDeg, {
          duration: swipe.springBackDurationMs,
        });
        intensity.value = withTiming(0, { duration: swipe.springBackDurationMs });
        direction.value = 0;
        runOnJS(onCommitLeft)();
        return;
      }

      translateX.value = withTiming(0, { duration: swipe.springBackDurationMs });
      rotation.value = withTiming(swipe.residualRotationDeg, {
        duration: swipe.springBackDurationMs,
      });
      intensity.value = withTiming(0, { duration: swipe.springBackDurationMs });
      direction.value = 0;
    });

  return { pan, translateX, rotation, direction, intensity };
}
