import {
  Fraunces_400Regular_Italic,
  useFonts as useFraunces,
} from '@expo-google-fonts/fraunces';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  useFonts as useInterTight,
} from '@expo-google-fonts/inter-tight';
import { Stack } from 'expo-router';
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

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [frauncesLoaded] = useFraunces({ Fraunces_400Regular_Italic });
  const [interTightLoaded] = useInterTight({
    InterTight_400Regular,
    InterTight_500Medium,
  });
  const fontsLoaded = frauncesLoaded && interTightLoaded;
  const session = useSession();

  useEffect(() => {
    logAuthCallbackUrl();
    void rehydrateUndoState();
    const stopUndoClear = wireUndoAutoClearOnSignOut();
    const stopAutoRefresh = wireAuthAutoRefresh();
    const stopOperatorCacheClear = wireOperatorCacheClear();
    return () => {
      stopUndoClear();
      stopAutoRefresh();
      stopOperatorCacheClear();
    };
  }, []);

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
