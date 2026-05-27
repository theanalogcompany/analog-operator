import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Pressable, Text, View } from 'react-native';

import { useNotificationPermission } from '@/hooks/use-notification-permission';

async function openSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // openSettings can fail on simulator / SDKs without the entitlement; the
    // banner just becomes a no-op tap there. Production builds on a real
    // device always have it available.
  }
}

export function PermissionDeniedBanner() {
  const status = useNotificationPermission();
  if (status !== 'denied') return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Enable push notifications in Settings"
      onPress={() => {
        void openSettings();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View
        className="flex-row items-center bg-parchment border-b border-hairline px-[22px] py-3"
        style={{ gap: 10 }}
      >
        <Feather name="bell-off" size={16} color="#4A4339" />
        <Text
          className="flex-1 font-inter-tight text-ink-soft"
          style={{ fontSize: 13, lineHeight: 18 }}
        >
          Push notifications are off. Tap to enable in Settings.
        </Text>
        <Feather name="chevron-right" size={16} color="#857A6A" />
      </View>
    </Pressable>
  );
}
