import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const OVERLAY_WIDTH_FRACTION = 0.55;

// CSS `linear-gradient(to left, A, B)` puts A at the gradient origin (right
// edge) and B at the destination (left edge); RN LinearGradient maps that via
// start/end normalized coords.
//
// Four stops with front-loaded `locations` (instead of a 2-stop opaque→clear
// ramp) give a perceptually smoother falloff — a plain 2-stop alpha gradient
// bands visibly on-device, especially fading to fully transparent. `dither`
// further suppresses the banding.
const RIGHT_GRADIENT_COLORS: readonly [string, string, string, string] = [
  'rgba(198,106,74,0.9)',
  'rgba(198,106,74,0.55)',
  'rgba(198,106,74,0.22)',
  'rgba(198,106,74,0)',
];
const LEFT_GRADIENT_COLORS: readonly [string, string, string, string] = [
  'rgba(58,53,48,0.75)',
  'rgba(58,53,48,0.45)',
  'rgba(58,53,48,0.18)',
  'rgba(58,53,48,0)',
];
const GRADIENT_LOCATIONS: readonly [number, number, number, number] = [0, 0.45, 0.75, 1];

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
          locations={GRADIENT_LOCATIONS}
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
          leftOverlayStyle,
        ]}
      >
        <LinearGradient
          colors={LEFT_GRADIENT_COLORS}
          locations={GRADIENT_LOCATIONS}
          dither
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </>
  );
}
