import { Text, View } from 'react-native';
import Animated, {
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { type SwipeDirection } from '@/hooks/use-queue-swipe';
import { fadeInAt } from '@/lib/entrance';
import { useEntrance, useRidesEntranceSlot } from '@/lib/entrance-context';
import { entrance, hint, typePresets } from '@/lib/theme';

/**
 * How a hint reads at a given drag. Pure and `'worklet'`-marked so the UI
 * thread can call it and a test can too — per CLAUDE.md/TAC-312, the gesture
 * layer's behavior has to be exercised somewhere, and "somewhere" cannot be a
 * test that mocks the gesture away.
 *
 * `grow` is 0..1 toward the active size; `dim` is 0..1 toward the dimmed color.
 * A hint grows when the drag heads its way and dims when the drag heads the
 * other way, so at rest both are 0 and both hints sit at 10px white.
 */
export function hintState(args: {
  side: 'left' | 'right';
  direction: SwipeDirection;
  intensity: number;
}): { grow: number; dim: number } {
  'worklet';
  const { side, direction, intensity } = args;
  const wants: SwipeDirection = side === 'right' ? 1 : -1;
  if (direction === wants) return { grow: intensity, dim: 0 };
  if (direction === -wants) return { grow: 0, dim: intensity };
  return { grow: 0, dim: 0 };
}

type Props = {
  direction: SharedValue<SwipeDirection>;
  intensity: SharedValue<number>;
  /** False for a blank draft: swiping right is not available, and "Send ->"
   *  says so permanently rather than only while the finger is down. */
  canSend: boolean;
  onPressHelp: () => void;
};

export function SwipeHints({
  direction,
  intensity,
  canSend,
  onPressHelp,
}: Props) {
  const { clock } = useEntrance();
  const hintsRide = useRidesEntranceSlot(entrance.hintsDelayMs);

  // Last in, as the card settles. The hints are the instruction, and the design
  // holds them back until there is something to instruct about.
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: hintsRide
      ? fadeInAt({
          elapsedMs: clock.value,
          delayMs: entrance.hintsDelayMs,
          durationMs: entrance.hintsDurationMs,
        })
      : 1,
  }));

  const leftStyle = useAnimatedStyle(() => {
    const { grow, dim } = hintState({
      side: 'left',
      direction: direction.value,
      intensity: intensity.value,
    });
    return {
      fontSize: hint.restSizePx + (hint.activeSizePx - hint.restSizePx) * grow,
      color: interpolateColor(dim, [0, 1], [hint.restColor, hint.dimmedColor]),
    };
  });

  const rightStyle = useAnimatedStyle(() => {
    const { grow, dim } = hintState({
      side: 'right',
      direction: direction.value,
      intensity: intensity.value,
    });
    return {
      fontSize: hint.restSizePx + (hint.activeSizePx - hint.restSizePx) * grow,
      color: interpolateColor(dim, [0, 1], [hint.restColor, hint.dimmedColor]),
    };
  });

  return (
    // box-none, not none. The design marks the whole row pointer-events:none so
    // the hints never steal a swipe — but the row also carries the only "Chat
    // with Jaipal" affordance on this screen, and killing that would be a
    // regression, not a translation. The hints themselves stay inert.
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'baseline',
        },
        entranceStyle,
      ]}
    >
      <View pointerEvents="none" style={{ flex: 1, alignItems: 'flex-start' }}>
        <Animated.Text
        allowFontScaling={false}
          className="font-inter-tight-medium"
          accessibilityLabel={
            canSend ? 'Swipe left to edit' : 'Swipe left to write'
          }
          style={[{ letterSpacing: typePresets.hint.tracking }, leftStyle]}
        >
          {canSend ? '← EDIT' : '← WRITE'}
        </Animated.Text>
      </View>

      <View style={{ flex: 0, paddingHorizontal: 10 }}>
        <Text
        allowFontScaling={false}
          accessibilityRole="link"
          accessibilityLabel="Chat with Jaipal via SMS"
          onPress={onPressHelp}
          numberOfLines={1}
          className="font-inter-tight-medium"
          style={{
            fontSize: typePresets.footer.size,
            letterSpacing: typePresets.footer.tracking,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {'NEED HELP? '}
          <Text allowFontScaling={false} style={{ color: '#FFFFFF' }}>CHAT WITH JAIPAL</Text>
        </Text>
      </View>

      <View pointerEvents="none" style={{ flex: 1, alignItems: 'flex-end' }}>
        {canSend ? (
          <Animated.Text
        allowFontScaling={false}
            className="font-inter-tight-medium"
            accessibilityLabel="Swipe right to send"
            style={[{ letterSpacing: typePresets.hint.tracking }, rightStyle]}
          >
            SEND →
          </Animated.Text>
        ) : (
          <Text
        allowFontScaling={false}
            className="font-inter-tight-medium"
            accessibilityLabel="Swipe right to send, unavailable — nothing drafted"
            style={{
              fontSize: hint.restSizePx,
              letterSpacing: typePresets.hint.tracking,
              color: hint.disabledColor,
            }}
          >
            SEND →
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
