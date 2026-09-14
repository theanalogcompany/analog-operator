import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { type SwipeDirection } from '@/hooks/use-queue-swipe';

/**
 * The two swipe washes, overlaid on the card and clipped to its corners.
 *
 * Values transcribed from the handoff README ("Swipe mechanics"), not from what
 * the previous implementation happened to render — it had drifted to 55% width
 * with a 0.9/0.75 peak alpha against the spec's 64% and 0.94/0.92.
 *
 * Each wash covers 64% of the card from its own edge and fades to nothing
 * inward. `dither` is on because multi-stop alpha ramps band visibly on-device,
 * especially where they fade to fully transparent.
 */
export const OVERLAY_WIDTH_FRACTION = 0.64;

// CSS `linear-gradient(to left, A, …)` places A at the gradient's origin — the
// RIGHT edge — and runs leftward. `start`/`end` below encode that direction;
// the colors stay in CSS source order.
/**
 * The two washes are SEPARATE maps on purpose, and not only because the hues
 * differ. Their alpha ramps differ too — the send wash peaks at 0.94 and the
 * edit wash at 0.92, with 0.52/0.18 against 0.5/0.16 below that. The gap is
 * invisible in a screenshot, which is exactly why a later edit is tempted to
 * unify them into one ramp parameterised by hue. Don't: the next person to
 * touch it would have to pick one, and the design picked both.
 */
export const RIGHT_WASH: readonly [string, string, string, string] = [
  'rgba(168,86,56,0.94)',
  'rgba(168,86,56,0.52)',
  'rgba(168,86,56,0.18)',
  'rgba(168,86,56,0)',
];
export const LEFT_WASH: readonly [string, string, string, string] = [
  'rgba(58,53,48,0.92)',
  'rgba(58,53,48,0.5)',
  'rgba(58,53,48,0.16)',
  'rgba(58,53,48,0)',
];
export const WASH_LOCATIONS: readonly [number, number, number, number] = [
  0, 0.44, 0.74, 1,
];

/**
 * Wash opacity for a given drag. Pure and exported so the mapping is testable
 * without driving a real gesture — per CLAUDE.md/TAC-312, a claim about what
 * the swipe renders cannot be made by a test that mocks the swipe away.
 *
 * A wash is visible only while the drag is heading its way, so each one reads
 * the direction as well as the intensity.
 *
 * The `'worklet'` directive is NOT optional and NOT decoration. This function is
 * called from inside `useAnimatedStyle`, whose body runs on the UI thread;
 * without the directive it stays an ordinary JS function and the call throws
 * there. Jest runs it as plain JS, so its unit tests pass either way — they
 * exercise the function but not the thread it has to run on.
 */
export function washOpacity(
  side: 'left' | 'right',
  direction: SwipeDirection,
  intensity: number,
): number {
  'worklet';
  const wants: SwipeDirection = side === 'right' ? 1 : -1;
  return direction === wants ? intensity : 0;
}

type Props = {
  direction: SharedValue<SwipeDirection>;
  intensity: SharedValue<number>;
};

export function SwipeOverlay({ direction, intensity }: Props) {
  const rightStyle = useAnimatedStyle(() => ({
    opacity: washOpacity('right', direction.value, intensity.value),
  }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: washOpacity('left', direction.value, intensity.value),
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: `${OVERLAY_WIDTH_FRACTION * 100}%`,
          },
          rightStyle,
        ]}
      >
        <LinearGradient
          colors={RIGHT_WASH}
          locations={WASH_LOCATIONS}
          dither
          start={{ x: 1, y: 0.5 }}
          end={{ x: 0, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: `${OVERLAY_WIDTH_FRACTION * 100}%`,
          },
          leftStyle,
        ]}
      >
        <LinearGradient
          colors={LEFT_WASH}
          locations={WASH_LOCATIONS}
          dither
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </>
  );
}
