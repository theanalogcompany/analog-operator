import { type View } from 'react-native';
import {
  type AnimatedRef,
  type MeasuredDimensions,
  measure,
  runOnJS,
} from 'react-native-reanimated';

/**
 * What stands between a gesture callback and the app aborting.
 *
 * A gesture callback is a worklet on the UI thread. In a debug build
 * `react-native-worklets` runs it through `__callGuardDEV`, which catches a
 * thrown error and shows it. In a release build that guard is compiled out
 * (`runOnRuntimeGuarded` in `Serializable.h`, the `NDEBUG` branch), so the
 * error leaves Hermes as a C++ exception with nothing to catch it and the
 * process aborts. A red box in development is a SIGABRT on TestFlight.
 *
 * That is how a tap anywhere on a queue card killed the app: the Tap's `onEnd`
 * called `measure()` on a ref no view was attached to. See `measureIfAttached`.
 */

/**
 * Logged at error level on purpose: it is the only console level Console.app
 * shows by default and the only one written to the persistent store, so it is
 * the only one readable off a TestFlight build (CLAUDE.md, TAC-419).
 */
function reportGestureError(name: string, message: string): void {
  console.error(`[gesture] ${name} threw on the UI thread: ${message}`);
}

/**
 * Wraps a gesture callback so an error inside it is reported, not fatal.
 *
 * `fn` must itself be a worklet, so keep its `'worklet';` directive: it is no
 * longer passed straight to `.onEnd()` and friends, which is where the babel
 * plugin would have workletized it for you. A plain function here would throw
 * on the UI thread on every event and be swallowed below, leaving a gesture
 * that silently does nothing, so a development build refuses one outright.
 *
 * `__tests__/lib/gesture-guard.test.ts` fails if a gesture callback under
 * `app/`, `components/`, `hooks/` or `lib/` is registered without this.
 */
export function guardGesture<Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => void,
): (...args: Args) => void {
  if (__DEV__ && !('__workletHash' in fn)) {
    throw new Error(
      `guardGesture('${name}') was given a function with no 'worklet' directive.`,
    );
  }
  return (...args: Args): void => {
    'worklet';
    try {
      fn(...args);
    } catch (error) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : String(error);
      runOnJS(reportGestureError)(name, message);
    }
  };
}

/**
 * Whether the value an animated ref hands the UI thread names a mounted view.
 *
 * On the UI thread a ref is a function returning its shadow node wrapper. It
 * returns `null` until a view takes the ref, and Reanimated's own `measure()`
 * only checks for `-1`.
 */
export function isRefAttached(wrapper: unknown): boolean {
  'worklet';
  return wrapper !== null && wrapper !== undefined && wrapper !== -1;
}

/**
 * `measure()`, for a ref that some renders never attach.
 *
 * Reanimated 4.1's `measure()` passes an unattached ref's `null` straight to
 * the native `_measure`, which throws `Value is null, expected an Object`. The
 * queue card's handle ref is attached only on an Instagram card that shows a
 * handle line, so on every other card that throw came from every tap.
 *
 * Call this instead of `measure()`. The same test that requires `guardGesture`
 * fails on a direct `measure` import anywhere else.
 */
export function measureIfAttached(
  ref: AnimatedRef<View>,
): MeasuredDimensions | null {
  'worklet';
  if (!isRefAttached(ref())) return null;
  return measure(ref);
}
