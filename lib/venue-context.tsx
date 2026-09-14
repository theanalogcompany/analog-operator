// lib/venue-context.tsx
// Which venue the operator is looking at. Mounted ABOVE QueueProvider in
// app/_layout.tsx, because the queue and conversations providers both filter
// their lists through the selection this holds (TAC-382).
//
// There is deliberately no "all venues" option. The merged view is the bug
// this ticket exists to remove, so it is not reachable from anywhere —
// including from an unresolved selection, which holds `status` at 'loading'
// rather than falling through to unfiltered data.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { type Venue, resolveOperatorVenues } from '@/lib/auth/operator';
import { useSession } from '@/lib/auth/use-session';
import {
  readSelectedVenueId,
  resolveSelectedVenueId,
  writeSelectedVenueId,
} from '@/lib/venue-selection';

export type VenueSelectionStatus = 'loading' | 'ready' | 'error';

export type VenueSelectionValue = {
  /** Every venue this operator is mapped to, name-sorted for display. */
  venues: Venue[];
  selectedVenueId: string | null;
  selectedVenue: Venue | null;
  status: VenueSelectionStatus;
  /** Switch venues. A venue the operator isn't mapped to is ignored. */
  select: (venueId: string) => void;
};

const VenueContext = createContext<VenueSelectionValue | null>(null);

export function useVenueSelection(): VenueSelectionValue {
  const ctx = useContext(VenueContext);
  if (!ctx) {
    throw new Error('useVenueSelection must be used inside <VenueProvider>');
  }
  return ctx;
}

type State = {
  operatorId: string | null;
  venues: Venue[];
  selectedVenueId: string | null;
  status: VenueSelectionStatus;
};

const EMPTY: State = {
  operatorId: null,
  venues: [],
  selectedVenueId: null,
  status: 'loading',
};

const FAILED: State = { ...EMPTY, status: 'error' };

export function VenueProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const isSignedIn = session.status === 'signed-in';
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    // Signed out resets to 'loading', not to 'ready' with no venues — this is
    // a shared venue device, so the outgoing operator's venue list must not
    // stay on screen, and 'ready' with an empty list would render as "this
    // operator has no venues", which is a different and wrong claim. Same
    // reasoning as the reset block in hooks/use-queue.ts.
    if (!isSignedIn) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;

    void (async () => {
      const resolved = await resolveOperatorVenues();
      if (cancelled) return;
      if (!resolved.ok) {
        setState(FAILED);
        return;
      }

      const stored = await readSelectedVenueId(resolved.operatorId);
      if (cancelled) return;

      const venues = [...resolved.venues].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      setState({
        operatorId: resolved.operatorId,
        venues,
        selectedVenueId: resolveSelectedVenueId(venues, stored),
        status: 'ready',
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // One writer, covering both ways a selection is reached: the operator
  // picking one, and the first-launch / stale-mapping default resolved above.
  // Persisting here rather than inside `select` keeps the write out of a
  // setState updater (StrictMode invokes those twice) and means the stored
  // value always matches what is actually on screen.
  const { operatorId, selectedVenueId, status } = state;
  useEffect(() => {
    if (status !== 'ready' || !operatorId || !selectedVenueId) return;
    void writeSelectedVenueId(operatorId, selectedVenueId);
  }, [status, operatorId, selectedVenueId]);

  const select = useCallback((venueId: string): void => {
    setState((prev) => {
      if (!prev.venues.some((v) => v.id === venueId)) return prev;
      if (prev.selectedVenueId === venueId) return prev;
      return { ...prev, selectedVenueId: venueId };
    });
  }, []);

  const value = useMemo<VenueSelectionValue>(
    () => ({
      venues: state.venues,
      selectedVenueId: state.selectedVenueId,
      selectedVenue:
        state.venues.find((v) => v.id === state.selectedVenueId) ?? null,
      status: state.status,
      select,
    }),
    [state, select],
  );

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>;
}
