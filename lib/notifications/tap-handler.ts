import * as Notifications from 'expo-notifications';
import { z } from 'zod';

/**
 * What a tapped notification points at.
 *
 * Two pushes arrive here. A draft push (TAC-207) carries `{ draftId, guestId,
 * operatorId }` and routes to the draft `draftId` names: since TAC-394 a guest
 * can hold two pending drafts, so the guest alone no longer names the card
 * (TAC-403). An arrival push for a heads-up card (TAC-297) carries
 * `{ commitmentId, guestId, operatorId }` and routes to that exact commitment.
 * This used to be one non-strict schema keyed on `guestId` alone, so a
 * commitment push parsed cleanly as a DRAFT tap with its `commitmentId` silently
 * stripped, and the app went looking for a draft that did not exist: the
 * operator was notified about a card they could not open. (TAC-364.)
 *
 * A draft target without `draftId` comes from a push that carried none, and
 * falls back to the guest. See `matchesTapTarget` in lib/queue-items.ts.
 */
export type TapTarget =
  | { kind: 'draft'; guestId: string; draftId?: string }
  | { kind: 'commitment'; guestId: string; commitmentId: string };

// APNs custom data per TAC-207 settled-decision #7 and TAC-297. `guestId` is on
// both pushes; `commitmentId` decides which kind of card was tapped; `draftId`
// names the draft a draft push is about; `operatorId` is informational only. A
// malformed payload (including a malformed `commitmentId` or `draftId`) is
// dropped, so a junk push never navigates the operator anywhere.
const TapPayloadSchema = z.object({
  guestId: z.string().uuid(),
  commitmentId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
});

export function parseTapPayload(data: unknown): TapTarget | null {
  const parsed = TapPayloadSchema.safeParse(data);
  if (!parsed.success) {
    if (__DEV__) {
      console.warn('[notifications/tap] invalid payload', parsed.error.message);
    }
    return null;
  }
  const { guestId, commitmentId, draftId } = parsed.data;
  if (commitmentId) return { kind: 'commitment', guestId, commitmentId };
  return draftId ? { kind: 'draft', guestId, draftId } : { kind: 'draft', guestId };
}

let pendingTap: TapTarget | null = null;
const subscribers = new Set<(target: TapTarget) => void>();

export function setPendingTap(target: TapTarget): void {
  pendingTap = target;
  subscribers.forEach((fn) => fn(target));
}

export function consumePendingTap(): TapTarget | null {
  const v = pendingTap;
  pendingTap = null;
  return v;
}

/**
 * Subscribe to tap events. If a tap is already pending at subscribe time
 * (cold-launch race: `setPendingTap` fired before any subscriber registered)
 * the callback fires immediately with that target. The ref is NOT drained by
 * this — the queue screen owns drain via `consumePendingTap()` on mount so the
 * surface-on-top behavior gets exactly one target per tap.
 */
export function subscribeToTaps(fn: (target: TapTarget) => void): () => void {
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
    const target = parseTapPayload(response.notification.request.content.data);
    if (target) setPendingTap(target);
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
    const target = parseTapPayload(response.notification.request.content.data);
    if (target) setPendingTap(target);
  });
  return () => sub.remove();
}

// Test-only reset.
export function __resetTapStateForTests(): void {
  pendingTap = null;
  subscribers.clear();
}
