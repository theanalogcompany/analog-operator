/**
 * The cold-launch entrance, as pure functions of one clock.
 *
 * Two things live here and they are related:
 *
 * 1. `consumeColdLaunch()` — the once-per-process flag that decides whether an
 *    entrance plays at all.
 * 2. The ramp functions — every layer's opacity and the card's rise, each a
 *    pure `'worklet'` function of milliseconds-since-boot.
 *
 * WHY PURE FUNCTIONS OF A CLOCK, rather than `withDelay(...)` per layer.
 *
 * The layers live in five different components that mount at different times.
 * `QueueCardStack` only mounts once the queue resolves, which can be well after
 * the card's 940ms slot. If each layer started its own animation at its own
 * mount, a slow fetch would start the card's rise late and a fast one would
 * start it early — the entrance would be a different length on every launch.
 * Driven from a single clock, a layer that mounts at t=1200ms reads the clock,
 * finds its window has passed, and renders resolved. That is what makes "a slow
 * or failed queue fetch does not extend, restart, or stall the entrance" and
 * "if data arrives late, do not replay" true by construction rather than by a
 * guard somebody has to remember. (TAC-384.)
 *
 * Per CLAUDE.md/TAC-312 these are exported and unit-tested directly: the
 * behaviour lives in the gesture/animation layer, so something has to exercise
 * that layer, and it cannot be a test that mocks the animation away.
 */

/* -------------------------------------------------------------------------- */
/* Cold-launch detection                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Module scope, so it survives every remount and resets only when the JS
 * context is torn down — which is precisely the definition of a cold launch.
 *
 * A mount is NOT a cold launch, and on this app a screen mount is nowhere near
 * one. `FrontCard` is keyed on `messageId` so it remounts on every swipe; the
 * tab row is `router.replace` between sibling stacks, so the queue screen
 * unmounts and remounts on every tab return; a venue switch remounts it too.
 * Resume-from-background re-runs no module scope at all, so it plays nothing
 * for free.
 *
 * Mirrors the `consumePendingTap` pattern in `lib/notifications/tap-handler.ts`
 * — same reason, same shape, same test-only reset.
 */
let coldLaunchAvailable = true;

/**
 * True exactly once per JS context, false forever after.
 *
 * Drained at the root the first time the app has anything to show, whatever
 * that screen is — sign-in or queue. Arming at boot rather than at auth is what
 * makes "never on the queue after authenticating" true: by the time the
 * operator finishes signing in, the sign-in screen has already spent it.
 */
export function consumeColdLaunch(): boolean {
  const was = coldLaunchAvailable;
  coldLaunchAvailable = false;
  return was;
}

/** Test-only. Jest keeps one module registry per file, but a test that asserts
 *  the once-only contract needs to re-arm between cases. */
export function __resetEntranceStateForTests(): void {
  coldLaunchAvailable = true;
}

/**
 * `off`     — not a cold launch. Nothing animates; every layer renders resolved.
 * `full`    — the Wick entrance.
 * `reduced` — `prefers-reduced-motion`. Skip to the resolved state; the only
 *             motion is one short ground cross-fade. No veil, no mark, no rise.
 */
export type EntranceMode = 'off' | 'full' | 'reduced';

/**
 * Which entrance, if any, this launch gets.
 *
 * Pulled out of the provider deliberately. Per CLAUDE.md/TAC-312 the decision a
 * component makes should be a pure exported function, so it can be tested
 * across every combination without mounting a provider or mocking an
 * accessibility API — the wiring is then tested separately and neither test
 * pretends to cover the other.
 *
 * Reduced motion loses to "not a cold launch": if there is no entrance to play,
 * there is nothing to reduce.
 */
export function resolveEntranceMode(args: {
  coldLaunch: boolean;
  reducedMotion: boolean;
}): EntranceMode {
  const { coldLaunch, reducedMotion } = args;
  if (!coldLaunch) return 'off';
  return reducedMotion ? 'reduced' : 'full';
}

/* -------------------------------------------------------------------------- */
/* Easing                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A CSS cubic-bezier timing function, solved on the UI thread.
 *
 * Hand-rolled rather than `Easing.bezier(...)` for two reasons: the layers are
 * driven from one clock, so easing has to be applied INSIDE a pure function of
 * that clock rather than handed to `withTiming`; and a plain function is
 * directly testable in Jest as ordinary JS, which is how every other pure
 * helper in this codebase is verified.
 *
 * `x` is elapsed progress 0..1; the return is eased progress 0..1. Newton-
 * Raphson against the x-polynomial, then evaluate y at the solved t — the
 * standard solution, with no inner closures because worklets should not build
 * functions on the UI thread.
 */
export function cubicBezierAt(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const dx = ((ax * t + bx) * t + cx) * t - x;
    if (dx < 1e-6 && dx > -1e-6) break;
    const slope = (3 * ax * t + 2 * bx) * t + cx;
    if (slope < 1e-6 && slope > -1e-6) break;
    t -= dx / slope;
  }
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  return ((ay * t + by) * t + cy) * t;
}

/** CSS `ease` — every opacity ramp in the entrance. */
export function easeAt(x: number): number {
  'worklet';
  return cubicBezierAt(0.25, 0.1, 0.25, 1, x);
}

/** `cubic-bezier(.2,.8,.2,1)` — the card's rise. Same curve as the swipe
 *  spring-back, and the first consumer of `easing.emphasizedDecelerate`. */
export function easeDecelerateAt(x: number): number {
  'worklet';
  return cubicBezierAt(0.2, 0.8, 0.2, 1, x);
}

/* -------------------------------------------------------------------------- */
/* Ramps                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `om-fade` — 0 → 1 across [delay, delay + duration), eased, clamped both ends.
 *
 * The clamps are what let a late-mounting layer render resolved instead of
 * animating from zero: past its window the ramp is already 1.
 */
export function fadeInAt(args: {
  elapsedMs: number;
  delayMs: number;
  durationMs: number;
}): number {
  'worklet';
  const { elapsedMs, delayMs, durationMs } = args;
  const x = (elapsedMs - delayMs) / durationMs;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return easeAt(x);
}

/** `om-deepen` — 1 → 0. The veil leaving as the ground arrives underneath. */
export function fadeOutAt(args: {
  elapsedMs: number;
  delayMs: number;
  durationMs: number;
}): number {
  'worklet';
  const { elapsedMs, delayMs, durationMs } = args;
  const x = (elapsedMs - delayMs) / durationMs;
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  return 1 - easeAt(x);
}

/**
 * `om-mark` — in, hold, out, as ONE ramp.
 *
 * This is the single most likely thing in the ticket to be built wrongly, and
 * the shape of the function is the defence. There is one value, computed once,
 * from one clock; there is no second animation that could win a backwards fill
 * and there is nothing to sequence. The first branch is `x <= 0 -> 0`, so the
 * mark's opacity before and at its own start is zero by construction, not by
 * timing. `__tests__/lib/entrance.test.ts` asserts exactly that at t=0.
 */
export function markOpacityAt(args: {
  elapsedMs: number;
  delayMs: number;
  durationMs: number;
  fadeInStop: number;
  holdStop: number;
}): number {
  'worklet';
  const { elapsedMs, delayMs, durationMs, fadeInStop, holdStop } = args;
  const x = (elapsedMs - delayMs) / durationMs;
  if (x <= 0) return 0;
  if (x >= 1) return 0;
  if (x < fadeInStop) return easeAt(x / fadeInStop);
  if (x < holdStop) return 1;
  return 1 - easeAt((x - holdStop) / (1 - holdStop));
}

/**
 * `om-rise` — the card's opacity and its translateY, from one ramp so the two
 * can never disagree about how far through the rise they are.
 */
export function cardRiseAt(args: {
  elapsedMs: number;
  delayMs: number;
  durationMs: number;
  fromPx: number;
}): { opacity: number; translateY: number } {
  'worklet';
  const { elapsedMs, delayMs, durationMs, fromPx } = args;
  const x = (elapsedMs - delayMs) / durationMs;
  if (x <= 0) return { opacity: 0, translateY: fromPx };
  if (x >= 1) return { opacity: 1, translateY: 0 };
  const eased = easeDecelerateAt(x);
  return { opacity: eased, translateY: fromPx * (1 - eased) };
}
