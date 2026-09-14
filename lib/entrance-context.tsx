import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  consumeColdLaunch,
  resolveEntranceMode,
  ridesEntranceClock,
  type EntranceMode,
} from '@/lib/entrance';
import { entrance } from '@/lib/theme';

export type { EntranceMode };

export type EntranceValue = {
  readonly mode: EntranceMode;
  /**
   * Milliseconds since the entrance began, on the UI thread.
   *
   * Pinned at `entrance.totalMs` whenever `mode !== 'full'`, so a ramp read
   * outside an entrance returns its resolved value.
   */
  readonly clock: SharedValue<number>;
  /** 0 -> 1 across `reducedMotionFadeMs`. Pinned at 1 unless `mode` is
   *  `reduced`. */
  readonly reduced: SharedValue<number>;
  /**
   * True while an entrance owns the screen: the 1.7s of a full entrance, or the
   * short fade of a reduced one. Anything asking "does the entrance own this
   * layer right now?" reads this, never `mode` — `mode` stays set for the whole
   * process, so a screen that mounts later would think it was still inside it.
   */
  readonly running: boolean;
  /**
   * Milliseconds since the entrance began, read on the JS thread.
   *
   * For decisions React makes once — whether a layer mounting now plays its
   * slot, whether a ground that just arrived can still ride the clock — never
   * for animation, which reads `clock`. `entrance.totalMs` whenever there is no
   * full entrance.
   */
  readonly elapsedMs: () => number;
};

const EntranceContext = createContext<EntranceValue | null>(null);

function resolvedElapsedMs(): number {
  return entrance.totalMs;
}

/**
 * The entrance clock, or a resolved stand-in when there is no provider above.
 *
 * The fallback is deliberate: every consumer (the ground, the nav, the deck,
 * the hints) is rendered on its own by existing tests, and none of them should
 * need an entrance provider bolted on to keep working. Without a provider they
 * read a clock that is already past the end of the entrance, which is exactly
 * "render the resolved state".
 */
export function useEntrance(): EntranceValue {
  const ctx = useContext(EntranceContext);
  // Hooks must run unconditionally, so the stand-in is always allocated; it is
  // simply unused when a real provider is present.
  // Explicitly `number`: the theme tokens are `as const`, so an inferred
  // shared value would be typed to the literal 1700 and reject any later write.
  const fallbackClock = useSharedValue<number>(entrance.totalMs);
  const fallbackReduced = useSharedValue<number>(1);
  const fallback = useMemo(
    () =>
      ({
        mode: 'off',
        running: false,
        clock: fallbackClock,
        reduced: fallbackReduced,
        elapsedMs: resolvedElapsedMs,
      }) as const,
    [fallbackClock, fallbackReduced],
  );
  return ctx ?? fallback;
}

/**
 * Whether a layer mounting now plays its entrance slot, or renders resolved.
 *
 * Decided once, at mount. A layer that mounts before its slot begins rides the
 * boot clock. One that mounts after it — the deck of a queue that landed late,
 * the next card after a swipe — appears in place instead of joining its ramp
 * partway through. Without a provider, and outside a full entrance, nothing
 * rides. (TAC-384.)
 */
export function useRidesEntranceSlot(slotStartMs: number): boolean {
  const ctx = useContext(EntranceContext);
  const [rides] = useState(
    () =>
      ctx !== null &&
      ridesEntranceClock({ elapsedMs: ctx.elapsedMs(), slotStartMs }),
  );
  return rides;
}

/**
 * Owns the one clock every entrance layer reads.
 *
 * Mounted at the root, immediately inside the gate that holds the tree back
 * until fonts and the session resolve — so it mounts once, on the first frame
 * the app has anything to show, signed in or out.
 */
export function EntranceProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();

  // Decided synchronously, on the provider's first render, and never revisited.
  //
  // It has to be synchronous: deferring the decision to an effect would paint
  // one frame of the fully-resolved queue before the veil covered it, which is
  // the flash this animation exists to replace. `useState`'s initializer is the
  // once-per-mount hook for that, and the flag it drains is module-scoped, so
  // even a remount of this provider cannot re-arm an entrance.
  //
  // The initializer is impure by design (it drains `consumeColdLaunch`). That
  // is safe here because this app does not enable StrictMode — if it ever does,
  // this decision needs to move to a module-level memo rather than becoming an
  // effect, for the flash reason above.
  const [mode] = useState<EntranceMode>(() =>
    resolveEntranceMode({
      coldLaunch: consumeColdLaunch(),
      reducedMotion,
    }),
  );

  const clock = useSharedValue<number>(mode === 'full' ? 0 : entrance.totalMs);
  const reduced = useSharedValue<number>(mode === 'reduced' ? 0 : 1);
  const [running, setRunning] = useState(mode !== 'off');
  // When the clock started, on the JS thread. Null until the start effect runs;
  // children's effects run before this one, and for them it is still t=0.
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    // Linear, because the easing belongs to each layer's own ramp. A single
    // eased master clock would ease every layer twice and none of them by the
    // curve the design specifies.
    if (mode === 'full') {
      startedAt.current = performance.now();
      clock.value = withTiming(entrance.totalMs, {
        duration: entrance.totalMs,
        easing: Easing.linear,
      });
      // One timer for the whole app, so "is the entrance still playing?" has
      // one answer rather than one per mounted consumer.
      const timer = setTimeout(() => setRunning(false), entrance.totalMs);
      return () => clearTimeout(timer);
    }
    if (mode === 'reduced') {
      reduced.value = withTiming(1, {
        duration: entrance.reducedMotionFadeMs,
        easing: Easing.linear,
      });
      const timer = setTimeout(
        () => setRunning(false),
        entrance.reducedMotionFadeMs,
      );
      return () => clearTimeout(timer);
    }
  }, [mode, clock, reduced]);

  const elapsedMs = useCallback((): number => {
    if (mode !== 'full') return entrance.totalMs;
    return startedAt.current === null
      ? 0
      : performance.now() - startedAt.current;
  }, [mode]);

  const value = useMemo<EntranceValue>(
    () => ({ mode, running, clock, reduced, elapsedMs }),
    [mode, running, clock, reduced, elapsedMs],
  );

  return (
    <EntranceContext.Provider value={value}>{children}</EntranceContext.Provider>
  );
}
