import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase/client';

export default function HomeScreen() {
  return (
    <View className="flex-1 bg-sand">
      <View className="flex-row justify-end px-6 pt-14">
        <Pressable
          onPress={() => supabase.auth.signOut()}
          className="rounded-full bg-inbound/10 px-4 py-2"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityLabel="Sign out"
        >
          <Text className="font-inter-tight text-inbound text-sm">Sign out</Text>
        </Pressable>
      </View>
      <View className="flex-1 items-center justify-center">
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
      </View>
      <StatusBar style="dark" />
    </View>
  );
}
