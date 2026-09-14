import { Feather } from '@expo/vector-icons';
import { View } from 'react-native';

type Props = {
  /** 30 on the queue card's composer, 32 in the edit takeover. */
  size?: 30 | 32;
  /** 1 when there is something to send; the design dims to 0.3 on the card
   *  and 0.4 in the takeover, where it is also inert. */
  opacity?: number;
};

const ICON_SIZE: Record<number, number> = { 30: 14, 32: 15 };

/** The clay paper-plane. Decorative — the tap target belongs to its parent. */
export function SendGlyph({ size = 30, opacity = 1 }: Props) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#A85638',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
      }}
    >
      <Feather name="send" size={ICON_SIZE[size]} color="#FFFFFF" />
    </View>
  );
}
