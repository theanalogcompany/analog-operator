/**
 * One clock for every reply-window timer on screen.
 *
 * The design hand-off is explicit: recompute on a one-minute interval and on
 * focus, never every second. A second-by-second tick would re-render the whole
 * deck sixty times a minute to change a number that only moves once, and the
 * label rounds down anyway, so fifty-nine of those renders are identical.
 *
 * ONE module-level interval with a subscriber refcount, not an interval per
 * card. `FrontCard` is keyed by the item and remounts on every swipe, so a
 * per-card interval would restart its minute from zero each time and a card
 * could sit there for most of a minute showing the previous card's reading.
 * A module clock is also what makes every timer on screen agree: two cards
 * must never disagree about what time it is.
 *
 * The timer is disposed when the last subscriber unmounts and re-armed on the
 * next mount, which is the pattern CLAUDE.md requires of every module-level
 * timer in this app (see `hooks/use-undo-state.ts`, TAC-266): without the
 * dispose, a test that mounts a card without unmounting cleanly leaks the
 * interval and Jest force-exits the worker; without the re-arm, the clock
 * never restarts after the deck is emptied and remounted.
 *
 * It also refreshes on foreground. A phone in a pocket for an hour comes back
 * with a timer an hour stale, and `setInterval` does not reliably fire while
 * the app is backgrounded. (TAC-486.)
 */

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** The design hand-off's interval. Exported so tests name it rather than 60000. */
export const TICK_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
const subscribers: Set<(nowMs: number) => void> = new Set();

function notify(): void {
  const now = Date.now();
  subscribers.forEach((fn) => fn(now));
}

function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

function start(): void {
  if (timer) return;
  timer = setInterval(notify, TICK_MS);
  appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    // Coming back from the background is the one moment the clock is most
    // wrong and the operator is most likely to act on it.
    if (state === 'active') notify();
  });
}

/**
 * The current time, refreshed every minute while anything is watching.
 *
 * Returns a millisecond timestamp rather than a formatted string so the pure
 * `windowState` stays the only thing that decides what a window means, and so
 * a test can drive it with fake timers.
 */
export function useNow(): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    subscribers.add(setNow);
    start();
    // Read the clock on mount: a card that mounts 59 seconds into the current
    // tick must not wait out the remainder showing a stale minute.
    setNow(Date.now());
    return () => {
      subscribers.delete(setNow);
      if (subscribers.size === 0) stop();
    };
  }, []);

  return now;
}

/** Test-only: drop the interval and every subscriber between cases. */
export function __resetNowClockForTests(): void {
  stop();
  subscribers.clear();
}
