import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-sand">
      <Text
        className="font-fraunces text-inbound"
        style={{ fontSize: 64, lineHeight: 72 }}
      >
        Analog
      </Text>
      <Text
        className="font-inter-tight text-inbound mt-2"
        style={{ fontSize: 20, lineHeight: 24 }}
      >
        Operator
      </Text>
      <StatusBar style="dark" />
    </View>
  );
}
