import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase/client';

export default function HomeScreen() {
  const router = useRouter();
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
      <View className="flex-1 items-center justify-center px-8">
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
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open approval queue"
          onPress={() => router.push('/queue')}
          className="mt-10 rounded-lg border-[0.5px] border-hairline bg-white px-5 py-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text
            className="font-inter-tight-medium uppercase text-ink"
            style={{ fontSize: 11, letterSpacing: 1.76 }}
          >
            Approval queue →
          </Text>
        </Pressable>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}
