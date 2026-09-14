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

/** Progress, tagged with the scope it was accumulated in. */
type ScopedProgress = { scope: string | null; progress: ProgressState };

/**
 * The stored progress, but only if it still belongs to the current scope.
 * A scope change means every card counted so far was another venue's, so the
 * count starts over rather than carrying a denominator across the switch.
 */
function progressInScope(
  prev: ScopedProgress,
  scope: string | null,
): ProgressState {
  return prev.scope === scope ? prev.progress : emptyProgress;
}

/**
 * @param visibleIds message ids currently on the deck.
 * @param scope resets the counter when it changes — the selected venue id.
 *   Cards seen in one venue must not inflate another's denominator, which is
 *   what made the counter read "01 / 07" after switching to a venue with three
 *   cards (TAC-382). Scope is compared at RENDER time rather than cleared in an
 *   effect: an effect would have to run before the `observeDrafts` one below to
 *   be correct, and a correctness bug that depends on the declaration order of
 *   two effects is one refactor away from coming back.
 */
export function useSessionProgress(
  visibleIds: readonly string[],
  scope: string | null = null,
): UseSessionProgressResult {
  const [state, setState] = useState<ScopedProgress>({
    scope,
    progress: emptyProgress,
  });
  const idsKey = visibleIds.join(',');
  const base = progressInScope(state, scope);

  // What the counter renders is derived, not stored: fold whatever is on
  // screen *this* render into the persisted state. Without this the first
  // paint of a freshly-loaded deck would read "01 / 00" for a frame, because
  // the effect that persists `seen` has not run yet.
  const view = useMemo(
    () => observeDrafts(base, visibleIds),
    // `visibleIds` is a fresh array identity every render; `idsKey` is its
    // stable content hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, idsKey],
  );

  // Persist, so a draft that has since left the deck still counts toward the
  // denominator.
  useEffect(() => {
    setState((prev) => ({
      scope,
      progress: observeDrafts(progressInScope(prev, scope), visibleIds),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, scope]);

  const markCleared = useCallback(
    (messageId: string) => {
      setState((prev) => ({
        scope,
        progress: recordCleared(progressInScope(prev, scope), messageId),
      }));
    },
    [scope],
  );

  const markRestored = useCallback(
    (messageId: string) => {
      setState((prev) => ({
        scope,
        progress: recordRestored(progressInScope(prev, scope), messageId),
      }));
    },
    [scope],
  );

  const { position, total } = useMemo(() => readProgress(view), [view]);

  return { position, total, markCleared, markRestored };
}
