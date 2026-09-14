import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  type EntranceMode,
} from '@/lib/entrance';
import { entrance } from '@/lib/theme';

export type { EntranceMode };

export type EntranceValue = {
  readonly mode: EntranceMode;
  /**
   * Milliseconds since the entrance began.
   *
   * Pinned at `entrance.totalMs` whenever `mode !== 'full'`, so a consumer
   * never branches on whether an entrance is playing — it asks the ramp for its
   * opacity at the current clock and gets 1 when there is no entrance. The
   * "layers that mount late render resolved" rule and the "no entrance at all"
   * case are then the same code path.
   */
  readonly clock: SharedValue<number>;
  /** 0 -> 1 across `reducedMotionFadeMs`. Pinned at 1 unless `mode` is
   *  `reduced`. */
  readonly reduced: SharedValue<number>;
};

const EntranceContext = createContext<EntranceValue | null>(null);

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
        clock: fallbackClock,
        reduced: fallbackReduced,
      }) as const,
    [fallbackClock, fallbackReduced],
  );
  return ctx ?? fallback;
}

/**
 * Owns the one clock every entrance layer reads.
 *
 * Mounted at the root, immediately inside the gate that holds the tree back
 * until fonts and the session resolve — so it mounts once, on the first frame
 * the app has anything to show, whatever that screen is.
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

  useEffect(() => {
    // Linear, because the easing belongs to each layer's own ramp. A single
    // eased master clock would ease every layer twice and none of them by the
    // curve the design specifies.
    if (mode === 'full') {
      clock.value = withTiming(entrance.totalMs, {
        duration: entrance.totalMs,
        easing: Easing.linear,
      });
      return;
    }
    if (mode === 'reduced') {
      reduced.value = withTiming(1, {
        duration: entrance.reducedMotionFadeMs,
        easing: Easing.linear,
      });
    }
  }, [mode, clock, reduced]);

  const value = useMemo<EntranceValue>(
    () => ({ mode, clock, reduced }),
    [mode, clock, reduced],
  );

  return (
    <EntranceContext.Provider value={value}>{children}</EntranceContext.Provider>
  );
}
