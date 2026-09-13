/**
 * The queue card's "01 / 04" counter.
 *
 * Session progress, not deck position: the denominator is how many distinct
 * drafts this session has seen, the numerator is how many have been cleared,
 * plus the one in hand. That choice is what makes a realtime insert read
 * honestly — a new draft arriving grows the denominator ("more came in")
 * instead of making the numerator jump backwards, which is what a
 * position-in-list counter would do.
 *
 * Undo rolls the numerator back: an undone send was not cleared. The
 * denominator never shrinks, because the draft was still seen.
 *
 * The reducer below is pure and exported so the arithmetic is testable without
 * mounting anything; the hook is a thin wrapper over it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

export type ProgressState = {
  /** Distinct message ids encountered this session, cleared ones included. */
  readonly seen: readonly string[];
  /** Message ids dispatched this session (sent, edited-and-sent, dismissed). */
  readonly cleared: readonly string[];
};

export const emptyProgress: ProgressState = { seen: [], cleared: [] };

/** Folds the currently-visible drafts into `seen`. Never removes. */
export function observeDrafts(
  state: ProgressState,
  ids: readonly string[],
): ProgressState {
  const additions = ids.filter((id) => !state.seen.includes(id));
  if (additions.length === 0) return state;
  return { ...state, seen: [...state.seen, ...additions] };
}

export function recordCleared(
  state: ProgressState,
  id: string,
): ProgressState {
  if (state.cleared.includes(id)) return state;
  // A card can be cleared without ever having been observed as visible (a
  // notification tap that dispatches immediately), so make sure it counts
  // toward the denominator too — otherwise position could exceed total.
  const seen = state.seen.includes(id) ? state.seen : [...state.seen, id];
  return { seen, cleared: [...state.cleared, id] };
}

export function recordRestored(
  state: ProgressState,
  id: string,
): ProgressState {
  if (!state.cleared.includes(id)) return state;
  return { ...state, cleared: state.cleared.filter((c) => c !== id) };
}

export function readProgress(state: ProgressState): {
  position: number;
  total: number;
} {
  const total = state.seen.length;
  // Clamped so a fully-drained deck can't render "05 / 04" if a caller reads
  // the counter while no card is in hand.
  const position = Math.min(state.cleared.length + 1, Math.max(total, 1));
  return { position, total };
}

export type UseSessionProgressResult = {
  position: number;
  total: number;
  markCleared: (messageId: string) => void;
  markRestored: (messageId: string) => void;
};

export function useSessionProgress(
  visibleIds: readonly string[],
): UseSessionProgressResult {
  const [state, setState] = useState<ProgressState>(emptyProgress);
  const idsKey = visibleIds.join(',');

  // What the counter renders is derived, not stored: fold whatever is on
  // screen *this* render into the persisted state. Without this the first
  // paint of a freshly-loaded deck would read "01 / 00" for a frame, because
  // the effect that persists `seen` has not run yet.
  const view = useMemo(
    () => observeDrafts(state, visibleIds),
    // `visibleIds` is a fresh array identity every render; `idsKey` is its
    // stable content hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, idsKey],
  );

  // Persist, so a draft that has since left the deck still counts toward the
  // denominator.
  useEffect(() => {
    setState((prev) => observeDrafts(prev, visibleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const markCleared = useCallback((messageId: string) => {
    setState((prev) => recordCleared(prev, messageId));
  }, []);

  const markRestored = useCallback((messageId: string) => {
    setState((prev) => recordRestored(prev, messageId));
  }, []);

  const { position, total } = useMemo(() => readProgress(view), [view]);

  return { position, total, markCleared, markRestored };
}
