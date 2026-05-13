import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const OVERLAY_WIDTH_FRACTION = 0.4;

// Ported literally from docs/prototypes/analog_operator_app_demo.html L236–237.
// CSS `linear-gradient(to left, A, B)` puts A at the right edge (gradient
// origin) and B at the left edge (destination); RN LinearGradient maps that
// via start/end normalized coords.
const RIGHT_GRADIENT_COLORS: readonly [string, string] = [
  'rgba(198,106,74,0.55)',
  'rgba(198,106,74,0)',
];
const LEFT_GRADIENT_COLORS: readonly [string, string] = [
  'rgba(58,53,48,0.45)',
  'rgba(58,53,48,0)',
];

type Props = {
  direction: SharedValue<-1 | 0 | 1>;
  intensity: SharedValue<number>;
};

export function SwipeOverlay({ direction, intensity }: Props) {
  const rightOverlayStyle = useAnimatedStyle(() => ({
    opacity: direction.value === 1 ? intensity.value : 0,
  }));
  const leftOverlayStyle = useAnimatedStyle(() => ({
    opacity: direction.value === -1 ? intensity.value : 0,
  }));
  const rightIconStyle = useAnimatedStyle(() => ({
    opacity: direction.value === 1 ? intensity.value : 0,
  }));
  const leftIconStyle = useAnimatedStyle(() => ({
    opacity: direction.value === -1 ? intensity.value : 0,
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
          rightOverlayStyle,
        ]}
      >
        <LinearGradient
          colors={RIGHT_GRADIENT_COLORS}
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
          leftOverlayStyle,
        ]}
      >
        <LinearGradient
          colors={LEFT_GRADIENT_COLORS}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: '50%',
            right: 28,
            transform: [{ translateY: -22 }],
          },
          rightIconStyle,
        ]}
      >
        <Feather name="send" size={44} color="#FFFFFF" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: '50%',
            left: 28,
            transform: [{ translateY: -22 }],
          },
          leftIconStyle,
        ]}
      >
        <Feather name="edit-2" size={44} color="#FFFFFF" />
      </Animated.View>
    </>
  );
}
