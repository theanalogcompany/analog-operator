import { Feather } from '@expo/vector-icons';
import { Image, Pressable, View } from 'react-native';

// Relative require (not the `@/` alias) so Metro's asset resolver picks it up.
const LOGO = require('../../assets/images/logo.png');

type Props = {
  onMenuPress: () => void;
};

export function QueueHeader({ onMenuPress }: Props) {
  return (
    <View className="flex-row items-center justify-between px-[22px] pb-2 pt-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        onPress={onMenuPress}
        hitSlop={12}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <Feather name="menu" size={22} color="#1C1814" />
      </Pressable>
      <Image
        source={LOGO}
        accessibilityLabel="Analog"
        resizeMode="contain"
        style={{ width: 34, height: 34 }}
      />
      <View style={{ width: 22 }} />
    </View>
  );
}
