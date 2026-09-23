import * as Notifications from 'expo-notifications';
import { z } from 'zod';

import { logDiag } from './diag';

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

/**
 * TAC-419 DIAGNOSTIC — PERMANENT. Do NOT delete this with the fix.
 *
 * This began as a one-build confirmation probe and was kept. A tap payload that
 * fails to parse is otherwise completely silent: the push still displays and
 * the badge still updates, because `aps` is standard APNs, so the only symptom
 * is a tap that does nothing. That is precisely how TAC-419 survived four
 * months undetected. See CLAUDE.md, "A remote push's custom fields are NOT on
 * `content.data`".
 *
 * Describes a value's SHAPE and never its contents: the type, or for an object
 * its sorted key names. The tap payload carries guest and operator UUIDs and a
 * device log read over a cable is not the place for them, so this follows the
 * `maskToken` precedent in `./token.ts` — enough to diagnose, nothing
 * identifying. Key NAMES are the whole diagnostic signal here, because the
 * question is which keys survived the native serializer.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Field paths and issue codes only — never the input.
 *
 * `error.message` carries no input values in the zod version installed today,
 * but nothing pins that (zod issues carry an optional `input` upstream), so the
 * property would depend on a third-party formatter across every future bump.
 * It is also bulky: each failing field contributes several hundred characters
 * of pretty-printed JSON, including the full UUID regex, to a device log. This
 * is value-free by construction rather than by inspection. (Raised in review.)
 */
function summariseZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}:${issue.code}`)
    .join(',');
}

function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value !== 'object') return typeof value;
  return `object{${Object.keys(value as Record<string, unknown>).sort().join(',')}}`;
}

/**
 * TAC-419 DIAGNOSTIC — PERMANENT. Do NOT delete this with the fix.
 *
 * Logs the two places a tap payload can live, side by side, for one tap:
 *
 * - `data` is `content.data`. `resolveTapPayload` is what reads it; it is no
 *   longer read directly by either entry point. For a REMOTE notification the
 *   native serializer returns `userInfo["body"]` for this, not the whole
 *   `userInfo`
 *   (`EXNotificationSerializer.m`, `serializedNotificationData`; line 83 as of
 *   expo-notifications 0.32.17 — line numbers drift, the contract test is the
 *   durable pointer).
 * - `trigger` is `trigger.payload`, which the same serializer sets to the FULL
 *   `userInfo` for a push trigger (`serializedTrigger`, line 129 at the same
 *   version, typed on
 *   the JS side as `PushNotificationTrigger.payload`).
 *
 * Logging both is what makes this build decisive rather than merely suggestive.
 * `data=undefined` alone cannot tell "the custom fields never left the server"
 * from "they arrived at the APNs top level and the serializer did not hand them
 * to us". Seeing `trigger=object{aps,draftId,guestId,operatorId}` in the same
 * line as `data=undefined` distinguishes those, and no other observation does.
 */
function logTapEnvelope(source: 'coldlaunch' | 'listener', response: unknown): void {
  const request = (response as { notification?: { request?: Record<string, unknown> } })
    ?.notification?.request;
  const content = request?.content as { data?: unknown } | undefined;
  const trigger = request?.trigger as { type?: unknown; payload?: unknown } | undefined;

  const resolved = resolveTapPayload(response);
  // Which branch supplied the payload, derived from the resolved value by
  // identity rather than by restating the rule. A second copy of the ordering
  // would start lying the moment `resolveTapPayload` changed, on the one
  // surface whose whole job is to be believed. (TAC-419, raised in review.)
  const via =
    resolved === undefined
      ? 'none'
      : resolved === content?.data
        ? 'data'
        : resolved === trigger?.payload
          ? 'trigger'
          : 'none';

  logDiag(
    'tap envelope',
    {
      source,
      via,
      data: describeShape(content?.data),
      triggerType:
        typeof trigger?.type === 'string' ? trigger.type : describeShape(trigger?.type),
      trigger: describeShape(trigger?.payload),
      resolved: describeShape(resolved),
    },
    'error',
  );
}

/**
 * Where a remote push's custom fields actually live, and why this exists.
 *
 * `analog-guest` sends custom fields at the APNs top level, beside `aps`:
 *
 * ```json
 * { "aps": {…}, "draftId": "…", "guestId": "…", "operatorId": "…" }
 * ```
 *
 * That is the raw-APNs convention, it is what TAC-207 #7 and TAC-288 #4
 * specified, and both repos implemented it faithfully. The party neither
 * Contract named is the client library. For a REMOTE notification
 * `expo-notifications` hands JS `userInfo["body"]` as `content.data`, not the
 * whole `userInfo` (`EXNotificationSerializer.m`, `serializedNotificationData`).
 * Nothing sends a top-level `body` key, so `content.data` is null on every push
 * this app has ever received, and every tap died here before matching.
 *
 * The same serializer sets the push trigger's `payload` to the FULL `userInfo`
 * (`serializedTrigger[@"payload"] = request.content.userInfo`), typed on the JS
 * side as `PushNotificationTrigger.payload`. So the fields are already in the
 * app, one key away, and no server change is needed to reach them.
 *
 * Order is `content.data` first, `trigger.payload` second, deliberately:
 *
 * - A LOCAL notification is serialized with the whole `userInfo` as
 *   `content.data` and has no push trigger, so the first branch is its only one.
 * - If Expo ever adopts the nested `body` convention server-side, or the library
 *   stops starving `content.data`, the first branch silently becomes correct
 *   again and the fallback goes quiet. This does not have to be revisited then.
 * - `trigger.payload` carries `aps` alongside the custom fields.
 *   `TapPayloadSchema` is a non-strict `z.object`, so `aps` is stripped at the
 *   parse boundary rather than rejected.
 *
 * Device-confirmed on a production build, 2026-09-22 cold launch:
 * `data: 'null', triggerType: 'push', trigger: 'object{aps,draftId,guestId,operatorId}'`.
 *
 * Exported and pure so the decision is testable without driving a real
 * notification, the same shape as `countsAsThreadRow` in
 * `lib/realtime/thread-channel.ts`. (TAC-419.)
 */
export function resolveTapPayload(response: unknown): unknown {
  const request = (response as { notification?: { request?: Record<string, unknown> } })
    ?.notification?.request;

  // `content.data` may only pre-empt the trigger when it is an OBJECT.
  //
  // This is not defensive typing, it closes a live way for TAC-419 to recur.
  // The serializer returns `userInfo["body"]` WHATEVER its type. `body` is the
  // single most likely key name to appear in a push payload — a message
  // preview, a text snippet — and the day a sender adds one, a bare non-nullish
  // check would hand that string straight back. `TapPayloadSchema` is a
  // `z.object`, so it could never parse, the fallback would never be consulted,
  // and the failure would be as silent as the original, with the diagnostic now
  // reading `via:'data'` and pointing the next investigation away from the
  // trigger. An object is exactly the precondition for this branch to be able
  // to succeed. (Raised in review.)
  const data = (request?.content as { data?: unknown } | undefined)?.data;
  if (isPlainObject(data)) return data;

  const payload = (request?.trigger as { payload?: unknown } | undefined)?.payload;
  if (isPlainObject(payload)) return payload;

  return undefined;
}

/**
 * Resolve a tapped notification response to a target. The entry points both go
 * through this rather than reading `content.data` themselves, so there is one
 * place that knows where a remote push keeps its custom fields. (TAC-419.)
 */
export function parseTapResponse(response: unknown): TapTarget | null {
  return parseTapPayload(resolveTapPayload(response));
}

export function parseTapPayload(data: unknown): TapTarget | null {
  const parsed = TapPayloadSchema.safeParse(data);
  if (!parsed.success) {
    // TAC-419: was `__DEV__`-gated, which is why every TestFlight build has been
    // silent about this. Unconditional for the confirmation build. The Zod
    // message names the failing field; `describeShape` names what arrived.
    logDiag(
      'tap parse FAILED',
      { data: describeShape(data), zod: summariseZodIssues(parsed.error) },
      'error',
    );
    return null;
  }
  const { guestId, commitmentId, draftId } = parsed.data;
  // TAC-419: a success line, so that silence in the log is unambiguous — it can
  // only mean the handler never ran, never "it ran and quietly worked".
  logDiag(
    'tap parse ok',
    { kind: commitmentId ? 'commitment' : 'draft', hasDraftId: draftId !== undefined },
    'error',
  );
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
    // TAC-419: report presence BEFORE the early return. Without this line, a
    // cold launch that was not started by a tap and a cold launch whose tap was
    // dropped look identical in the log — both are silence.
    //
    // Only the 'present' case is error level. A launch nobody tapped into is
    // the overwhelmingly common case and says nothing about a tap, and every
    // `console.error` goes through RN's ExceptionsManager
    // (`installConsoleErrorReporter` is unconditional in setUpErrorHandling),
    // which under `__DEV__` raises a LogBox notification. At error level this
    // line would put a red box on every single local launch. Enable Console's
    // Include Info Messages to see the 'none' case. (Raised in review.)
    const present = response !== null && response !== undefined;
    logDiag('tap coldlaunch', { response: present ? 'present' : 'none' }, present ? 'error' : 'log');
    if (!response) return;
    logTapEnvelope('coldlaunch', response);
    const target = parseTapResponse(response);
    if (target) setPendingTap(target);
  } catch (e) {
    // TAC-419: was `__DEV__`-gated. A throw here is itself a possible cause of
    // the observed behaviour, so it has to be visible on the release build.
    logDiag(
      'tap coldlaunch THREW',
      { message: e instanceof Error ? e.message : String(e) },
      'error',
    );
  }
}

/**
 * Subscribe to warm-launch taps. Returns a teardown.
 */
export function wireTapResponseListener(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    // TAC-419: fires on a background/foreground tap.
    logDiag('tap listener fired', undefined, 'error');
    logTapEnvelope('listener', response);
    const target = parseTapResponse(response);
    if (target) setPendingTap(target);
  });
  return () => sub.remove();
}

// Test-only reset.
export function __resetTapStateForTests(): void {
  pendingTap = null;
  subscribers.clear();
}
