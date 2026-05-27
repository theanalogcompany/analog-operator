import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { registerDeviceToken } from '@/lib/api/devices';
import { type ApiError, type Result, err, ok } from '@/lib/api/errors';

const STORAGE_KEY = 'analog-operator.notifications.last-registered-token.v1';

async function readLastRegistered(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeLastRegistered(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, token);
  } catch (e) {
    if (__DEV__) {
      console.warn('[notifications/token] AsyncStorage write failed', e);
    }
  }
}

async function fetchToken(): Promise<Result<string>> {
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (!data || data.length === 0) {
      return err<ApiError>({ kind: 'NETWORK', message: 'empty device token' });
    }
    return ok(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'token fetch failed';
    return err<ApiError>({ kind: 'NETWORK', message });
  }
}

/**
 * Cold-launch entry. Fetches the current device push token, registers it with
 * analog-guest if it differs from the last successfully-registered token, and
 * persists the new token to AsyncStorage on success. On failure, AsyncStorage
 * is NOT updated — the next cold launch retries automatically (per TAC-207
 * settled-decision #7; no client-side retry timer).
 */
export async function fetchAndRegisterDeviceToken(): Promise<Result<'registered' | 'skipped'>> {
  const tokenResult = await fetchToken();
  if (!tokenResult.ok) return tokenResult;
  const token = tokenResult.data;

  const last = await readLastRegistered();
  if (last === token) {
    return ok('skipped');
  }

  const registerResult = await registerDeviceToken({ token, platform: 'ios' });
  if (!registerResult.ok) {
    if (__DEV__) {
      console.warn('[notifications/token] register failed; will retry next cold launch', registerResult.error);
    }
    return registerResult;
  }

  await writeLastRegistered(token);
  return ok('registered');
}

/**
 * Subscribe to Apple's token-rotation events. Re-POSTs the rotated token and
 * updates AsyncStorage on success. Returns a teardown.
 */
export function wireTokenRotationListener(): () => void {
  const sub = Notifications.addPushTokenListener((event) => {
    const next = event.data;
    if (!next || next.length === 0) return;
    void (async () => {
      const result = await registerDeviceToken({ token: next, platform: 'ios' });
      if (!result.ok) {
        if (__DEV__) {
          console.warn('[notifications/token] rotation re-register failed', result.error);
        }
        return;
      }
      await writeLastRegistered(next);
    })();
  });
  return () => sub.remove();
}

// Test-only reset of the AsyncStorage key.
export async function __resetTokenStateForTests(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
