// lib/queue-context.tsx
// Queue data lives here, not in app/queue/_layout.tsx, so both the /queue
// stack and the new /conversations stack can read the same live queue count
// (the tab header shows it on both screens) without opening a second
// listQueue() fetch or a second realtime subscription.
//
// It is also where venue filtering happens (TAC-382). Filtering ONCE here,
// rather than in each screen, is what makes "every venue-scoped view respects
// the selection" true by construction instead of by vigilance: the queue
// screen, the edit takeover, the top-nav count and the app-icon badge all read
// `drafts` and `commitments` from this context, so none of them can be
// forgotten.

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { type UseQueueResult, useQueue } from '@/hooks/use-queue';
import { useSession } from '@/lib/auth/use-session';
import { type VenueSelectionValue, useVenueSelection } from '@/lib/venue-context';
import { filterByVenue } from '@/lib/venue-filter';

export type QueueContextValue = UseQueueResult & {
  /**
   * The venue a guest's pending card belongs to, looked up across ALL the
   * operator's venues rather than just the selected one. A card is a pending
   * draft or a heads-up card; returns null when neither matches.
   *
   * This is the one deliberate window onto unfiltered data, and it is shaped
   * to stay one: it answers "which venue?" with a venue id, and cannot be used
   * to render a cross-venue card. It exists for the notification tap, which
   * arrives with a guestId and no venueId, so without this the app could not
   * tell whether a tapped guest belongs to the venue on screen. Heads-up cards
   * are consulted too, because an arrival push is a tap like any other.
   * (TAC-364.) Do NOT widen this into an `allDrafts` escape hatch; that
   * re-creates the merged view TAC-382 removed.
   */
  findVenueIdForGuest: (guestId: string) => string | null;
};

/** Just the two fields the filtering reads, so neither provider depends on
 *  the shape of the rest of the venue context. */
type VenueScope = Pick<VenueSelectionValue, 'selectedVenueId' | 'status'>;

const QueueContext = createContext<QueueContextValue | null>(null);

export function useQueueContext(): QueueContextValue {
  const ctx = useContext(QueueContext);
  if (!ctx) {
    throw new Error('useQueueContext must be used inside <QueueProvider>');
  }
  return ctx;
}

/** Narrow a queue result to one venue. Not exported: the provider below is
 *  what produces the behavior, and the tests mount it for real. */
function scopeQueueToVenue(
  queue: UseQueueResult,
  venue: VenueScope,
): QueueContextValue {
  const drafts = filterByVenue(queue.drafts, venue.selectedVenueId);
  // Heads-up cards go through the same filter. A commitment carries `venueId`
  // for exactly this (TAC-364): without it the card would have to bypass the
  // filter and show one venue's arrivals to an operator looking at another.
  const commitments = filterByVenue(queue.commitments, venue.selectedVenueId);

  // Venue status leads. An unresolved selection means we genuinely don't know
  // what to show yet, and reporting 'ready' with an empty list would render
  // the "you're all caught up" empty state — a confident claim about a venue
  // we haven't identified. If venue resolution failed outright, the queue is
  // in error: falling back to unfiltered data here would silently restore the
  // merged view at exactly the moment we are least sure.
  const status =
    venue.status === 'ready'
      ? queue.status
      : venue.status === 'error'
        ? 'error'
        : 'loading';

  return {
    ...queue,
    drafts,
    commitments,
    status,
    // `restore` is passed through DELIBERATELY UNFILTERED. It writes into the
    // full list, so undoing a send made in venue A while venue B is on screen
    // puts that draft back into A's list where it belongs, rather than
    // injecting it into B's. That cross-venue write is the bug TAC-382 flagged
    // as highest priority, and this is the fix (option 1): the undo window
    // survives a venue switch and `POST /undo` is untouched. Wrapping
    // `restore` to filter would break it. `restoreCommitment` passes through
    // unfiltered for the same reason.
    findVenueIdForGuest: (guestId: string) =>
      queue.drafts.find((d) => d.guestId === guestId)?.venueId ??
      queue.commitments.find((c) => c.guestId === guestId)?.venueId ??
      null,
  };
}

// `enabled` mirrors the exact pre-lift behavior: the queue only ever fetched
// once an operator was signed in (it used to only mount once expo-router
// entered the auth-gated /queue stack). QueueProvider now always mounts, so
// the gate moves inside instead of relying on conditional mounting.
export function QueueProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const venue = useVenueSelection();
  const queue = useQueue({ enabled: session.status === 'signed-in' });
  const value = useMemo(() => scopeQueueToVenue(queue, venue), [queue, venue]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}
