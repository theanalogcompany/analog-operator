import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

type Listener = (message: string | null) => void;

const listeners = new Set<Listener>();
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (listeners.size === 0) {
    // No subscribers — the auto-dismiss timer would only call back into an
    // empty Set anyway, and leaving it scheduled keeps the Node worker
    // alive past suite completion in tests that exercise a screen without
    // mounting the root layout's <Toast />.
    return;
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
      // When the last Toast unmounts, dispose the module-level 4s dismiss
      // timer so a pending setTimeout doesn't keep the Node worker alive
      // after a test suite finishes (same pattern as use-undo-state).
      if (listeners.size === 0 && dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <View
      className="absolute bottom-12 left-4 right-4 rounded-xl bg-inbound px-4 py-3"
      style={{ pointerEvents: 'none' }}
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
