import * as Notifications from 'expo-notifications';
import { z } from 'zod';

// APNs custom data per TAC-207 settled-decision #7. `guestId` is the routing key;
// `draftId` + `operatorId` are informational only. Strict parse — malformed
// payloads are dropped so a junk push never navigates the operator anywhere.
const TapPayloadSchema = z.object({
  guestId: z.string().uuid(),
  draftId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
});

export function parseTapPayload(data: unknown): string | null {
  const parsed = TapPayloadSchema.safeParse(data);
  if (!parsed.success) {
    if (__DEV__) {
      console.warn('[notifications/tap] invalid payload', parsed.error.message);
    }
    return null;
  }
  return parsed.data.guestId;
}

let pendingGuestId: string | null = null;
const subscribers = new Set<(guestId: string) => void>();

export function setPendingTap(guestId: string): void {
  pendingGuestId = guestId;
  subscribers.forEach((fn) => fn(guestId));
}

export function consumePendingTap(): string | null {
  const v = pendingGuestId;
  pendingGuestId = null;
  return v;
}

/**
 * Subscribe to tap events. If a tap is already pending at subscribe time
 * (cold-launch race: `setPendingTap` fired before any subscriber registered)
 * the callback fires immediately with that guestId. The ref is NOT drained by
 * this — the queue screen owns drain via `consumePendingTap()` on mount so the
 * surface-on-top behavior gets exactly one guestId per tap.
 */
export function subscribeToTaps(fn: (guestId: string) => void): () => void {
  subscribers.add(fn);
  if (pendingGuestId !== null) {
    fn(pendingGuestId);
  }
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * Hydrate the pending-tap ref from the initial notification response if the app
 * was cold-launched by a tap. Runs once at boot via `wireNotifications`.
 */
export async function captureInitialTap(): Promise<void> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return;
    const guestId = parseTapPayload(response.notification.request.content.data);
    if (guestId) setPendingTap(guestId);
  } catch (e) {
    if (__DEV__) {
      console.warn('[notifications/tap] initial-response fetch failed', e);
    }
  }
}

/**
 * Subscribe to warm-launch taps. Returns a teardown.
 */
export function wireTapResponseListener(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const guestId = parseTapPayload(response.notification.request.content.data);
    if (guestId) setPendingTap(guestId);
  });
  return () => sub.remove();
}

// Test-only reset.
export function __resetTapStateForTests(): void {
  pendingGuestId = null;
  subscribers.clear();
}
