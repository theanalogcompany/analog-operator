import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

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
      <Text
        className="font-fraunces text-ink"
        style={{ fontSize: 22, letterSpacing: -0.44 }}
      >
        the analog company
      </Text>
      <View style={{ width: 22 }} />
    </View>
  );
}
