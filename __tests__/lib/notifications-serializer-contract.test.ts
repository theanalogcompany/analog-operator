import { readFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * TAC-419 — the serializer boundary.
 *
 * ## Why this file exists, and what it honestly is
 *
 * TAC-419's acceptance criteria ask for "a test that crosses the serializer
 * boundary rather than hand-feeding `content.data`". **A Jest test cannot do
 * that literally.** The serializer is Objective-C compiled into the app
 * (`EXNotificationSerializer.m`); no JS runtime executes it, and jest-expo mocks
 * the native module entirely. Any test claiming to have run it would be the
 * exact defect CLAUDE.md names — a test scoped to the wrong layer, reporting
 * green, which is a stronger signal than having no test at all.
 *
 * So this file does the two things that ARE checkable from here, and the ticket
 * names what covers the rest.
 *
 * 1. `notifications-tap-handler.test.ts` exercises the handler against the
 *    response shape the serializer really produces, transcribed verbatim from a
 *    production device log rather than from our own code.
 * 2. This file pins the two behaviours of the installed native source that the
 *    fix depends on. It reads `EXNotificationSerializer.m` out of
 *    `node_modules` as text. If an `expo-notifications` upgrade changes either
 *    one, this fails loudly at the next `npm test` instead of silently on a
 *    TestFlight build three weeks later — which is how the original defect got
 *    in and stayed in.
 *
 * What is NOT covered here, and what covers it: that a real APNs push, sent by
 * `analog-guest`, taps through to the right card. Only a device can show that.
 * It is TAC-419's `QA: Device` gate — a tap from a killed app and from
 * background on a TestFlight build — and TAC-403's device gate re-run on the
 * same build, since TAC-403's matching logic has never once executed on device.
 */

// `expo-notifications` exposes ./package.json through its exports map today.
// If a future version stops doing so this throws at collection time, which is
// the correct loud failure: it means the pinning below is no longer running.
const pkgJsonPath = require.resolve('expo-notifications/package.json');
const pkgRoot = dirname(pkgJsonPath);
const installedVersion = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version as string;

const serializerPath = join(
  pkgRoot,
  'ios/EXNotifications/Notifications/EXNotificationSerializer.m',
);

/** Collapse whitespace so formatting churn upstream doesn't fail the assertion. */
const flatten = (s: string): string => s.replace(/\s+/g, ' ');

describe(`expo-notifications native serializer (installed ${installedVersion})`, () => {
  let source: string;

  beforeAll(() => {
    // Deliberately not wrapped in a try/skip. If the file is gone, the
    // assumption this fix rests on is unverifiable and the suite must say so.
    source = flatten(readFileSync(serializerPath, 'utf8'));
  });

  // THIS is why `content.data` is null on every remote push. The library hands
  // JS `userInfo["body"]`, which is Expo's own push-service convention. Nothing
  // in `analog-guest` sends a top-level `body` key, and per TAC-419 it is not
  // going to start — the client reads the trigger instead.
  // Matched semantically rather than as whole statements: a cosmetic upstream
  // refactor (hoisting `request.content.userInfo` into a local, say) would turn
  // an exact-match assertion red with no behaviour change, and a red test that
  // is not believed gets deleted.
  it('still returns userInfo["body"] as content.data for a REMOTE notification', () => {
    expect(source).toMatch(/isRemote\s*\?[^;]*userInfo\[@"body"\]/);
  });

  it('still decides "remote" by UNPushNotificationTrigger', () => {
    expect(source).toMatch(/isRemote\s*=\s*\[\s*request\.trigger\s+isKindOfClass:\s*\[UNPushNotificationTrigger\s+class\]\s*\]/);
  });

  // THIS is what makes the fix possible with no server change: the same
  // serializer puts the FULL userInfo on the push trigger's payload, so the
  // top-level custom fields are already in the app, one key away.
  it('still exposes the full userInfo as the push trigger payload', () => {
    expect(source).toMatch(/serializedTrigger\[@"payload"\]\s*=\s*request\.content\.userInfo/);
  });

  it('still tags a push trigger as type "push"', () => {
    expect(source).toMatch(/serializedTrigger\[@"type"\]\s*=\s*@"push"/);
  });
});

/**
 * IF THIS SUITE GOES RED, READ THIS BEFORE CHANGING ANYTHING.
 *
 * It means an `expo-notifications` upgrade moved ground the tap handler stands
 * on. Do not relax the assertion to make it pass. Instead:
 *
 * 1. Open the installed `EXNotificationSerializer.m` and read
 *    `serializedNotificationData` and `serializedTrigger`.
 * 2. If `content.data` now carries the full `userInfo` for a remote push, the
 *    library adopted the raw-APNs convention and `resolveTapPayload`'s first
 *    branch is doing the work again. The fallback becomes dead but harmless;
 *    confirm on device before deleting it.
 * 3. If `trigger.payload` is gone or renamed, the fallback is BROKEN and every
 *    notification tap is silently dead again. That is TAC-419 exactly. Fix
 *    `resolveTapPayload` and re-run the device gate before shipping.
 * 4. Update this file and the CLAUDE.md gotcha together.
 */

describe('expo-notifications JS types', () => {
  // The fallback reads a documented, typed, public field — not a private one.
  it('declares payload on PushNotificationTrigger', () => {
    const types = flatten(
      readFileSync(join(pkgRoot, 'build/Notifications.types.d.ts'), 'utf8'),
    );
    expect(types).toContain('export type PushNotificationTrigger = { type: \'push\';');
    expect(types).toMatch(/payload\?: Record<string, unknown>;/);
  });
});
