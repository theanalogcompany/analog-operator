/**
 * Narrow a venue-carrying list down to a single venue.
 *
 * Returns `[]` when nothing is selected — deliberately NOT the unfiltered
 * list. A "no selection yet, so show everything" fallback is precisely the
 * merged view TAC-382 exists to remove, and it fails open: the one state
 * where the filter is least sure of itself would be the state where it shows
 * the most. Callers tell "empty because no venue is resolved" apart from
 * "empty because this venue is quiet" via status, never by inspecting the
 * array — see `lib/venue-context.tsx`, which holds status at `'loading'`
 * until a selection exists.
 */
export function filterByVenue<T extends { venueId: string }>(
  items: readonly T[],
  venueId: string | null,
): T[] {
  if (!venueId) return [];
  return items.filter((item) => item.venueId === venueId);
}
