// The selected venue's Instagram connection, for the You screen (TAC-517).
//
// Refetches on a venue switch and every time the app returns to the
// foreground. The foreground refetch is how a connect finished in the browser
// reaches the screen: the callback page only says "go back to the app", there
// is no deep link, and the Contract has no pending status to poll for.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type InstagramConnection, getVenueState } from '@/lib/api/venues';

export type VenueInstagramState =
  | { kind: 'loading' }
  | { kind: 'ready'; instagram: InstagramConnection | null }
  | { kind: 'error' };

export function useVenueInstagram(venueId: string | null): {
  state: VenueInstagramState;
  refetch: () => void;
} {
  const [state, setState] = useState<VenueInstagramState>({ kind: 'loading' });
  // Each fetch takes a ticket; a response answers only if its ticket is still
  // the newest. That drops a slow answer for the venue the operator just left,
  // and an older foreground fetch overtaken by a newer one.
  const latest = useRef(0);

  const load = useCallback(async (id: string, showLoading: boolean) => {
    const ticket = ++latest.current;
    if (showLoading) setState({ kind: 'loading' });
    const result = await getVenueState(id);
    if (ticket !== latest.current) return;
    setState(result.ok ? { kind: 'ready', instagram: result.data.instagram } : { kind: 'error' });
  }, []);

  useEffect(() => {
    if (!venueId) {
      latest.current += 1;
      setState({ kind: 'loading' });
      return;
    }
    void load(venueId, true);
  }, [venueId, load]);

  // A foreground refetch keeps what is on screen until the answer lands, so
  // coming back from an abandoned flow shows no flicker and nothing alarming.
  const venueRef = useRef(venueId);
  venueRef.current = venueId;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && venueRef.current) void load(venueRef.current, false);
    });
    return () => sub.remove();
  }, [load]);

  const refetch = useCallback(() => {
    if (venueRef.current) void load(venueRef.current, true);
  }, [load]);

  return { state, refetch };
}
