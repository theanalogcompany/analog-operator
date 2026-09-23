import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { type ReplyWindowState, hasWindow } from '@/lib/reply-window';
import { easing, replyWindow } from '@/lib/theme';

type Props = {
  state: ReplyWindowState;
};

/** 0..1 of the window still open, or 0 for a window that has shut. */
function fillFraction(state: ReplyWindowState): number {
  return state.kind === 'plenty' || state.kind === 'close' || state.kind === 'urgent'
    ? state.fill
    : 0;
}

/**
 * The 6px drain bar under the flag strip (TAC-486, A1).
 *
 * The fill is ALWAYS the full Instagram gradient, spanning the filled width, so
 * a nearly spent bar still shows every colour instead of decaying into the
 * yellows. Only the length changes between states. That is what lets one
 * element say two things at once: how much window is left, and which channel
 * owns the deadline. It is also why the glyph beside the handle is monochrome —
 * a second gradient on the same card would compete with the bucket strip.
 *
 * It measures itself rather than taking a width, so the card does not have to
 * plumb its inner width down through the head.
 *
 * Renders nothing when there is no window to draw: a text card, or an Instagram
 * card whose window nobody measured.
 */
export function ReplyWindowBar({ state }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const fillWidth = useSharedValue<number>(0);
  /**
   * Whether the bar has ever been drawn at a real width. Until it has, the
   * target is written without animating: the hand-off animates a RECOMPUTE, not
   * a mount, and a bar that slid out from zero on first paint would read as the
   * window refilling rather than draining.
   */
  const measured = useRef(false);

  const fraction = fillFraction(state);
  const target =
    trackWidth > 0 && fraction > 0
      ? Math.max(replyWindow.bar.minFillPx, fraction * trackWidth)
      : 0;

  useEffect(() => {
    if (!measured.current) {
      if (trackWidth > 0) {
        measured.current = true;
        fillWidth.value = target;
      }
      return;
    }
    fillWidth.value = withTiming(target, {
      duration: replyWindow.bar.animateMs,
      easing: Easing.bezier(...easing.emphasizedDecelerate),
    });
  }, [target, trackWidth, fillWidth]);

  const style = useAnimatedStyle(() => ({ width: fillWidth.value }));

  if (!hasWindow(state)) return null;

  return (
    <View
      // Scenery. The pill beside the guest's name states this same window in
      // words, and a second announcement of a bar is noise an operator cannot
      // act on.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="reply-window-bar"
      onLayout={(event: LayoutChangeEvent) =>
        setTrackWidth(event.nativeEvent.layout.width)
      }
      style={{
        height: replyWindow.bar.heightPx,
        backgroundColor: replyWindow.bar.trackColor,
        // The card's own clip rounds the outer edges; this sits flush under the
        // flag strip and above the head.
        overflow: 'hidden',
      }}
    >
      <Animated.View
        testID="reply-window-bar-fill"
        style={[
          {
            height: replyWindow.bar.heightPx,
            borderTopRightRadius: replyWindow.bar.fillRadiusPx,
            borderBottomRightRadius: replyWindow.bar.fillRadiusPx,
            overflow: 'hidden',
          },
          style,
        ]}
      >
        <LinearGradient
          colors={[...replyWindow.gradient.colors]}
          locations={[...replyWindow.gradient.locations]}
          start={replyWindow.gradient.start}
          end={replyWindow.gradient.end}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}
