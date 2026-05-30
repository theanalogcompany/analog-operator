import * as Notifications from 'expo-notifications';
import { z } from 'zod';

// APNs custom data. Originally TAC-207 settled-decision #7 keyed on `guestId`
// alone. TAC-298 adds `commitmentId` for heads-up commitment pushes (see
// analog-guest `send-commitment-push.ts`) — when present, the queue screen
// surfaces the matching commitment card preferentially over a guest-id match
// (handles the case where a guest has both a draft and a heads-up at once).
// Both ids parsed as optional UUIDs; `guestId` stays required as the legacy
// routing key. Strict parse — malformed payloads are dropped silently.
const TapPayloadSchema = z.object({
  guestId: z.string().uuid(),
  draftId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  commitmentId: z.string().uuid().optional(),
});

export type PendingTap = {
  guestId: string;
  commitmentId: string | null;
};

export function parseTapPayload(data: unknown): PendingTap | null {
  const parsed = TapPayloadSchema.safeParse(data);
  if (!parsed.success) {
    if (__DEV__) {
      console.warn('[notifications/tap] invalid payload', parsed.error.message);
    }
    return null;
  }
  return {
    guestId: parsed.data.guestId,
    commitmentId: parsed.data.commitmentId ?? null,
  };
}

let pendingTap: PendingTap | null = null;
const subscribers = new Set<(tap: PendingTap) => void>();

export function setPendingTap(tap: PendingTap): void {
  pendingTap = tap;
  subscribers.forEach((fn) => fn(tap));
}

export function consumePendingTap(): PendingTap | null {
  const v = pendingTap;
  pendingTap = null;
  return v;
}

/**
 * Subscribe to tap events. If a tap is already pending at subscribe time
 * (cold-launch race: `setPendingTap` fired before any subscriber registered)
 * the callback fires immediately with that tap. The ref is NOT drained by
 * this — the queue screen owns drain via `consumePendingTap()` on mount so
 * the surface-on-top behavior gets exactly one tap per fire.
 */
export function subscribeToTaps(fn: (tap: PendingTap) => void): () => void {
  subscribers.add(fn);
  if (pendingTap !== null) {
    fn(pendingTap);
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
    const tap = parseTapPayload(response.notification.request.content.data);
    if (tap) setPendingTap(tap);
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
    const tap = parseTapPayload(response.notification.request.content.data);
    if (tap) setPendingTap(tap);
  });
  return () => sub.remove();
}

// Test-only reset.
export function __resetTapStateForTests(): void {
  pendingTap = null;
  subscribers.clear();
}
