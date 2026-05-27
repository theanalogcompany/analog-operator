import { AppState, type AppStateStatus } from 'react-native';

import {
  refreshPermissionStatus,
  subscribeToPermissionStatus,
} from './permissions';
import { captureInitialTap, wireTapResponseListener } from './tap-handler';
import { fetchAndRegisterDeviceToken, wireTokenRotationListener } from './token';

/**
 * Wire up notification handling once at app-root boot. Pattern mirrors
 * `wireAuthAutoRefresh()` / `wireOperatorCacheClear()` from `lib/auth/*`.
 *
 * Returns a teardown that cleans up all subscriptions. Wired in
 * `app/_layout.tsx`'s root effect, NOT in an auth-gated child — the rotation
 * listener must survive sign-out → sign-in cycles per TAC-288 settled decision.
 */
export function wireNotifications(): () => void {
  const stopRotation = wireTokenRotationListener();
  const stopTapListener = wireTapResponseListener();

  void captureInitialTap();
  void refreshPermissionStatus();

  // When permission becomes 'granted' (either at boot or after the operator
  // returns from iOS Settings flipping it on), kick off token registration.
  // Dedupe via AsyncStorage means repeated calls with the same token are
  // cheap — the no-op skip path is hit in steady state.
  const stopPermissionWatch = subscribeToPermissionStatus((status) => {
    if (status === 'granted') {
      void fetchAndRegisterDeviceToken();
    }
  });

  // Re-check permission on foreground so the banner unmounts when the operator
  // returns from iOS Settings. This is independent of the auth-refresh hook
  // already wired in `lib/auth/app-state.ts`.
  const handleAppStateChange = (state: AppStateStatus): void => {
    if (state === 'active') {
      void refreshPermissionStatus();
    }
  };
  const appStateSub = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    stopRotation();
    stopTapListener();
    stopPermissionWatch();
    appStateSub.remove();
  };
}
