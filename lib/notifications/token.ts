import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { registerDeviceToken } from '@/lib/api/devices';
import { type ApiError, type Result, err, ok } from '@/lib/api/errors';

import { logDiag } from './diag';

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
    const message = e instanceof Error ? e.message : 'asyncstorage write failed';
    logDiag('asyncstorage write failed', { message });
  }
}

/**
 * Mask a device token for safe logging. APNs hex tokens are 64 chars; we keep
 * the first/last 6 as a fingerprint sufficient for debugging without putting
 * the full token into device logs that may be shared.
 */
function maskToken(token: string): string {
  if (token.length <= 16) return `${token.slice(0, 4)}…${token.slice(-4)}`;
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
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

type RegisterFailure = ApiError & { stage: 'fetch-token' | 'post-token' };

export type FetchAndRegisterResult =
  | { ok: true; data: 'registered' | 'skipped' }
  | { ok: false; error: RegisterFailure };

/**
 * Cold-launch entry. Fetches the current device push token, registers it with
 * analog-guest if it differs from the last successfully-registered token, and
 * persists the new token to AsyncStorage on success. On failure, AsyncStorage
 * is NOT updated — the next cold launch retries automatically (per TAC-207
 * settled-decision #7; no client-side retry timer).
 *
 * Logs every step via `logDiag` so failures during UAT can be diagnosed from
 * macOS Console.app device logs without needing to redeploy with extra
 * instrumentation. (TAC-288 follow-up after UAT #2.)
 */
export async function fetchAndRegisterDeviceToken(): Promise<FetchAndRegisterResult> {
  logDiag('register start');

  const tokenResult = await fetchToken();
  if (!tokenResult.ok) {
    logDiag('fetch-token failed', { kind: tokenResult.error.kind });
    return { ok: false, error: { ...tokenResult.error, stage: 'fetch-token' } };
  }
  const token = tokenResult.data;
  logDiag('fetch-token ok', { token: maskToken(token), length: token.length });

  const last = await readLastRegistered();
  if (last === token) {
    logDiag('dedupe skip — token unchanged');
    return { ok: true, data: 'skipped' };
  }

  logDiag('posting to analog-guest', {
    endpoint: '/api/operators/devices',
    previous: last ? maskToken(last) : 'none',
  });
  const registerResult = await registerDeviceToken({ token, platform: 'ios' });
  if (!registerResult.ok) {
    logDiag('post failed', { ...registerResult.error });
    return { ok: false, error: { ...registerResult.error, stage: 'post-token' } };
  }

  await writeLastRegistered(token);
  logDiag('register ok', { token: maskToken(token) });
  return { ok: true, data: 'registered' };
}

/**
 * Subscribe to Apple's token-rotation events. Re-POSTs the rotated token and
 * updates AsyncStorage on success. Returns a teardown.
 */
export function wireTokenRotationListener(): () => void {
  const sub = Notifications.addPushTokenListener((event) => {
    const next = event.data;
    if (!next || next.length === 0) return;
    logDiag('rotation event', { token: maskToken(next) });
    void (async () => {
      const result = await registerDeviceToken({ token: next, platform: 'ios' });
      if (!result.ok) {
        logDiag('rotation post failed', { ...result.error });
        return;
      }
      await writeLastRegistered(next);
      logDiag('rotation register ok', { token: maskToken(next) });
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
