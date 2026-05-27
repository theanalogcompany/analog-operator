import * as Notifications from 'expo-notifications';

import { type ApiError, type Result, err, ok } from '@/lib/api/errors';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'loading';

let currentStatus: PermissionStatus = 'loading';
const subscribers = new Set<(status: PermissionStatus) => void>();

function emit(next: PermissionStatus): void {
  if (next === currentStatus) return;
  currentStatus = next;
  subscribers.forEach((fn) => fn(next));
}

// Compare to string literals rather than `Notifications.PermissionStatus.*`
// enum members — the underlying enum values ARE 'granted' / 'denied' /
// 'undetermined' (string enum), and the literal form avoids depending on the
// enum being present on the jest mock (jest.mock returns a partial object).
function normalize(status: Notifications.PermissionStatus): PermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export function getCurrentPermissionStatus(): PermissionStatus {
  return currentStatus;
}

export function subscribeToPermissionStatus(
  fn: (status: PermissionStatus) => void,
): () => void {
  subscribers.add(fn);
  fn(currentStatus);
  return () => {
    subscribers.delete(fn);
  };
}

export async function refreshPermissionStatus(): Promise<Result<PermissionStatus>> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    const next = normalize(status);
    emit(next);
    return ok(next);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'permission lookup failed';
    return err<ApiError>({ kind: 'NETWORK', message });
  }
}

export async function requestPermission(): Promise<Result<PermissionStatus>> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    const next = normalize(status);
    emit(next);
    return ok(next);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'permission request failed';
    return err<ApiError>({ kind: 'NETWORK', message });
  }
}

// Test-only reset. Avoids cross-test leakage of the module-level emitter.
export function __resetPermissionStateForTests(): void {
  currentStatus = 'loading';
  subscribers.clear();
}
