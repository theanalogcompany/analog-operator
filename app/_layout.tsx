import {
  Fraunces_400Regular_Italic,
  useFonts as useFraunces,
} from '@expo-google-fonts/fraunces';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  useFonts as useInterTight,
} from '@expo-google-fonts/inter-tight';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/global.css';

import { Toast } from '@/components/auth/toast';
import {
  rehydrateUndoState,
  wireUndoAutoClearOnSignOut,
} from '@/hooks/use-undo-state';
import { wireAuthAutoRefresh } from '@/lib/auth/app-state';
import { logAuthCallbackUrl } from '@/lib/auth/dev-log';
import { wireOperatorCacheClear } from '@/lib/auth/operator';
import { useSession } from '@/lib/auth/use-session';
import { requestPermissionIfUndetermined } from '@/lib/notifications/permissions';
import { subscribeToTaps } from '@/lib/notifications/tap-handler';
import { wireNotifications } from '@/lib/notifications/wire';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [frauncesLoaded] = useFraunces({ Fraunces_400Regular_Italic });
  const [interTightLoaded] = useInterTight({
    InterTight_400Regular,
    InterTight_500Medium,
  });
  const fontsLoaded = frauncesLoaded && interTightLoaded;
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    logAuthCallbackUrl();
    void rehydrateUndoState();
    const stopUndoClear = wireUndoAutoClearOnSignOut();
    const stopAutoRefresh = wireAuthAutoRefresh();
    const stopOperatorCacheClear = wireOperatorCacheClear();
    const stopNotifications = wireNotifications();
    return () => {
      stopUndoClear();
      stopAutoRefresh();
      stopOperatorCacheClear();
      stopNotifications();
    };
  }, []);

  // Route notification taps to /queue once the session is resolved as signed-in.
  // Pattern (a) per TAC-288: cold-launch taps land before the auth gate clears,
  // so the tap-handler module holds the pending guestId and this effect fires
  // router.push() only when we're sure the gate won't bounce us to sign-in.
  // The queue screen reads consumePendingTap() on mount to surface the card.
  useEffect(() => {
    if (session.status !== 'signed-in') return;
    return subscribeToTaps(() => {
      router.push('/queue');
    });
  }, [session.status, router]);

  // Fire the iOS push-permission prompt on the first authenticated render
  // (TAC-288 settled-decision #5). Lives here — NOT in wireNotifications —
  // because the prompt must wait for the auth gate to clear; we don't want
  // to ask an unauthenticated visitor for push permissions. Fires for both
  // the SecureStore auto-login path (session.status: loading → signed-in)
  // and the SMS-OTP path (signed-out → signed-in). iOS only shows the
  // prompt once per install regardless; the `Undetermined`-guard in the
  // helper keeps us from re-invoking requestPermissionsAsync after the
  // operator has answered. (TAC-288 follow-up.)
  useEffect(() => {
    if (session.status !== 'signed-in') return;
    void requestPermissionIfUndetermined();
  }, [session.status]);

  useEffect(() => {
    if (fontsLoaded && session.status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, session.status]);

  if (!fontsLoaded || session.status === 'loading') {
    return null;
  }

  const isSignedIn = session.status === 'signed-in';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={isSignedIn}>
            <Stack.Screen name="index" />
            <Stack.Screen name="queue" />
          </Stack.Protected>
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Screen name="auth/callback" />
        </Stack>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
