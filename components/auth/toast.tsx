import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

type Listener = (message: string | null) => void;

const listeners = new Set<Listener>();
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
  }
  listeners.forEach((l) => l(message));
  dismissTimer = setTimeout(() => {
    listeners.forEach((l) => l(null));
    dismissTimer = null;
  }, 4000);
}

export function Toast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <View
      className="absolute bottom-12 left-4 right-4 rounded-xl bg-inbound px-4 py-3"
      pointerEvents="none"
    >
      <Text
        className="font-inter-tight text-sand"
        style={{ fontSize: 15, lineHeight: 20 }}
      >
        {message}
      </Text>
    </View>
  );
}
