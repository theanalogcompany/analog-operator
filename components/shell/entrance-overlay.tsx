import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { GroundPaint } from '@/components/ground/ground';
import { fadeOutAt, markOpacityAt } from '@/lib/entrance';
import { useEntrance } from '@/lib/entrance-context';
import { VEIL_GROUND } from '@/lib/grounds';
import { entrance } from '@/lib/theme';

// The mark ships dark with an alpha channel; `tintColor` is the RN equivalent
// of the design's `brightness(0) invert(1)`, and the same treatment the
// sign-in frame already uses. Not a second asset.
const MARK = require('../../assets/images/logo.png');

/**
 * The two layers of the entrance that belong to no screen: the near-black veil
 * and the mark that fades up through it.
 *
 * Rendered at the root, above everything, and `pointerEvents="none"` for its
 * whole life, so it never takes a touch. The layers beneath it only receive
 * touches once they are visible — iOS does not hit-test a view below 0.01
 * alpha — so the card becomes swipeable as it rises, inside the ticket's 1.5s.
 * (TAC-384.)
 */
export function EntranceOverlay() {
  const { mode, running, clock } = useEntrance();

  const veilStyle = useAnimatedStyle(() => ({
    opacity: fadeOutAt({
      elapsedMs: clock.value,
      delayMs: entrance.groundDelayMs,
      durationMs: entrance.groundDurationMs,
    }),
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacityAt({
      elapsedMs: clock.value,
      delayMs: entrance.markDelayMs,
      durationMs: entrance.markDurationMs,
      fadeInStop: entrance.markFadeInStop,
      holdStop: entrance.markHoldStop,
    }),
  }));

  // Leaves when the entrance ends, not at the mark's last frame. The UI clock only
  // starts once the first tree has mounted, so a JS timer set to 1240ms could
  // remove the mark on a slow launch while it was still visible. The extra
  // half-second is spent at zero opacity.
  if (mode !== 'full' || !running) return null;

  return (
    <View
      testID="entrance-overlay"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <GroundPaint ground={VEIL_GROUND} />
      </Animated.View>

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center' },
          markStyle,
        ]}
      >
        <Image
          source={MARK}
          resizeMode="contain"
          tintColor="#FFFFFF"
          style={{ width: entrance.markSizePx, height: entrance.markSizePx }}
        />
      </Animated.View>
    </View>
  );
}
