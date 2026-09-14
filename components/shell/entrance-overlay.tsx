import { useEffect, useState } from 'react';
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

/** The mark is the last thing on screen; once it has faded there is nothing
 *  left to paint, so the whole overlay leaves rather than sitting at zero
 *  opacity over every subsequent frame. */
const OVERLAY_LIFETIME_MS = entrance.markDelayMs + entrance.markDurationMs;

/**
 * The two layers of the entrance that belong to no screen: the near-black veil
 * and the mark that fades up through it.
 *
 * Rendered at the root, above everything, and `pointerEvents="none"` for its
 * whole life — the queue underneath is swipeable from the first frame. The
 * entrance never gates interaction; the 1.5s in the ticket is a floor on when
 * the card is *in place*, not a lock. (TAC-384.)
 */
export function EntranceOverlay() {
  const { mode, clock } = useEntrance();
  const [visible, setVisible] = useState(mode === 'full');

  useEffect(() => {
    if (mode !== 'full') return;
    const timer = setTimeout(() => setVisible(false), OVERLAY_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [mode]);

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

  if (!visible) return null;

  return (
    <View
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
