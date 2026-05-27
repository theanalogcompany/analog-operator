import { AppState, type AppStateStatus } from 'react-native';

import { showToast } from '@/components/auth/toast';

import { logDiag } from './diag';
import {
  refreshPermissionStatus,
  subscribeToPermissionStatus,
} from './permissions';
import { captureInitialTap, wireTapResponseListener } from './tap-handler';
import {
  fetchAndRegisterDeviceToken,
  formatRegistrationFailureMessage,
  wireTokenRotationListener,
} from './token';

/**
 * Wire up notification handling once at app-root boot. Pattern mirrors
 * `wireAuthAutoRefresh()` / `wireOperatorCacheClear()` from `lib/auth/*`.
 *
 * Returns a teardown that cleans up all subscriptions. Wired in
 * `app/_layout.tsx`'s root effect, NOT in an auth-gated child — the rotation
 * listener must survive sign-out → sign-in cycles per TAC-288 settled decision.
 */
export function wireNotifications(): () => void {
  logDiag('wireNotifications attaching');
  const stopRotation = wireTokenRotationListener();
  const stopTapListener = wireTapResponseListener();

  void captureInitialTap();
  void refreshPermissionStatus();

  // When permission becomes 'granted' (either at boot or after the operator
  // returns from iOS Settings flipping it on), kick off token registration.
  // Dedupe via AsyncStorage means repeated calls with the same token are
  // cheap — the no-op skip path is hit in steady state.
  //
  // Three toasts fire unconditionally so UAT can confirm the chain ran AND
  // see the outcome — production builds can't bridge `console.log` to iOS
  // unified logging without a native OSLog wrapper (separate ticket), so the
  // toast is the only diagnostic surface available. UAT #2 after PR #25
  // showed NO toast at all, which left us unable to distinguish "subscriber
  // never fired" from "registration succeeded (so no failure toast) but
  // server didn't persist." Surfacing every outcome resolves that ambiguity.
  // Strip the diagnostic toasts back to "failure only" once the actual bug
  // is identified and the chain is proven healthy.
  const stopPermissionWatch = subscribeToPermissionStatus((status) => {
    logDiag('permission status', { status });
    if (status !== 'granted') return;
    void (async () => {
      showToast('Push registration: starting…');
      const result = await fetchAndRegisterDeviceToken();
      if (result.ok) {
        showToast(`Push registration: ${result.data}`);
      } else {
        showToast(formatRegistrationFailureMessage(result.error));
      }
    })();
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
