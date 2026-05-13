import { Feather } from '@expo/vector-icons';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const OVERLAY_WIDTH_FRACTION = 0.4;

type Props = {
  direction: SharedValue<-1 | 0 | 1>;
  intensity: SharedValue<number>;
};

export function SwipeOverlay({ direction, intensity }: Props) {
  const rightOverlayStyle = useAnimatedStyle(() => ({
    opacity: direction.value === 1 ? intensity.value * 0.55 : 0,
  }));
  const leftOverlayStyle = useAnimatedStyle(() => ({
    opacity: direction.value === -1 ? intensity.value * 0.45 : 0,
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
            backgroundColor: '#C66A4A',
          },
          rightOverlayStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: `${OVERLAY_WIDTH_FRACTION * 100}%`,
            backgroundColor: '#3A3530',
          },
          leftOverlayStyle,
        ]}
      />
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
