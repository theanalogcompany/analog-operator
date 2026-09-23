import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQueueRealtime } from '@/hooks/use-queue-realtime';
import { type ApiError } from '@/lib/api/errors';
import {
  type HeadsUpCommitment,
  type PendingDraft,
  listQueue,
} from '@/lib/api/queue';
import { type QueueChannelEvent } from '@/lib/realtime/queue-channel';

export type QueueStatus = 'loading' | 'ready' | 'error';

export type UseQueueResult = {
  drafts: PendingDraft[];
  /** `pending_ack` commitments, rendered as heads-up cards. (TAC-364.) */
  commitments: HeadsUpCommitment[];
  status: QueueStatus;
  error: ApiError | null;
  reload: () => Promise<void>;
  /** Remove a draft from the local list (after a swipe commit, before the API resolves). */
  optimisticallyRemove: (messageId: string) => void;
  /** Restore a draft into the local list (called on API failure or undo). */
  restore: (draft: PendingDraft) => void;
  /** The heads-up counterparts of the two above, keyed on the commitment id. */
  optimisticallyRemoveCommitment: (commitmentId: string) => void;
  restoreCommitment: (commitment: HeadsUpCommitment) => void;
};

// Recognition tier, as a tiebreak. `recognitionState` ranks
// raving_fan > regular > returning > new; a null/unknown tier sorts last.
const TIER_RANK: Record<string, number> = {
  raving_fan: 3,
  regular: 2,
  returning: 1,
  new: 0,
};

function importanceRank(draft: PendingDraft): number {
  return draft.recognitionState ? (TIER_RANK[draft.recognitionState] ?? -1) : -1;
}

/**
 * When this card stops being sendable, as an absolute instant.
 *
 * `Infinity` for a card with no deadline: a text guest, or an Instagram guest
 * whose window nobody measured. Those sort AFTER every card that has one,
 * because a card that can wait indefinitely should never sit above one that
 * cannot.
 */
function deadlineMs(draft: PendingDraft): number {
  if (draft.guestChannel !== 'instagram' || draft.replyWindowExpiresAt === null) {
    return Infinity;
  }
  const parsed = Date.parse(draft.replyWindowExpiresAt);
  return Number.isNaN(parsed) ? Infinity : parsed;
}

/**
 * Queue order: **time left first, most urgent at the top.**
 *
 * Ruled 2026-09-23. **This CHANGES the observable order**, and the ticket's own
 * note said it would not, so it is worth being explicit: this used to sort by
 * recognition tier FIRST and age second, which put a raving fan with twenty
 * hours of window above a new guest with forty minutes. The queue buried
 * exactly the card that was about to become unsendable. Recognition tier is now
 * a tiebreak within equal urgency, not the primary key.
 *
 * Sorted by GUEST rather than by card, which is what makes a guest's cards
 * consecutive in the deck by construction. The sub-queue row ("2 / 3 cards for
 * Mia") claims they sit together; a per-card comparator would make that usually
 * true, and untrue whenever another guest's card happened to tie between them.
 *
 * A guest ranks by their soonest deadline, then their strongest recognition
 * tier, then their oldest waiting card. Within a guest, oldest first.
 *
 * Do not "simplify" the deadline step away once a second channel exists. Today
 * Le Mil's is Instagram-only so every card has a window and the mixed case is
 * TAC-528, but the intent is that urgency leads, and it is expressed here on
 * purpose.
 */
function sortByPriority(list: PendingDraft[]): PendingDraft[] {
  const byGuest = new Map<string, PendingDraft[]>();
  for (const draft of list) {
    const existing = byGuest.get(draft.guestId);
    if (existing) existing.push(draft);
    else byGuest.set(draft.guestId, [draft]);
  }

  const groups = [...byGuest.values()].map((cards) => ({
    // Oldest first within one guest, so their cards read in the order they
    // arrived.
    cards: [...cards].sort((a, b) => b.pendingSinceMs - a.pendingSinceMs),
    deadline: Math.min(...cards.map(deadlineMs)),
    tier: Math.max(...cards.map(importanceRank)),
    oldest: Math.max(...cards.map((card) => card.pendingSinceMs)),
  }));

  groups.sort((a, b) => {
    const byDeadline = a.deadline - b.deadline;
    // Infinity - Infinity is NaN, which would leave the no-deadline group in an
    // arbitrary order rather than falling through to the tiebreaks.
    if (byDeadline !== 0 && !Number.isNaN(byDeadline)) return byDeadline;
    const byTier = b.tier - a.tier;
    if (byTier !== 0) return byTier;
    return b.oldest - a.oldest;
  });

  return groups.flatMap((group) => group.cards);
}

// Oldest promise first, the order the server already sends them in, so a
// restored heads-up card goes back where it was rather than to the end.
function sortCommitments(list: HeadsUpCommitment[]): HeadsUpCommitment[] {
  return [...list].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  );
}

export function useQueue(options?: { enabled?: boolean }): UseQueueResult {
  const enabled = options?.enabled ?? true;
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [commitments, setCommitments] = useState<HeadsUpCommitment[]>([]);
  const [status, setStatus] = useState<QueueStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);
  // Tracks the LATEST `enabled` value, read after `await listQueue()` below.
  // `reload` closes over the `enabled` that was current when the fetch
  // *started*; if `enabled` flips to false while the fetch is in flight, the
  // mount effect below re-runs (its deps include `reload`, which gets a new
  // identity on every `enabled` toggle) and resets `mounted.current` back to
  // true before the in-flight promise resolves, defeating the `mounted`
  // guard. `enabledRef` is updated synchronously on every render, including
  // the `enabled: false` render that fires the sign-out reset, so checking
  // it after the await reflects reality at resolution time, not at call
  // time — closing the race where a stale fetch clobbers the reset with the
  // outgoing operator's data.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const reload = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setStatus('loading');
    setError(null);
    const result = await listQueue();
    if (!mounted.current || !enabledRef.current) return;
    if (result.ok) {
      setDrafts(sortByPriority(result.data.drafts));
      setCommitments(sortCommitments(result.data.commitments));
      setStatus('ready');
    } else {
      setError(result.error);
      setStatus('error');
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    if (enabled) void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload, enabled]);

  // QueueProvider now mounts at the root and stays mounted across sign-out/
  // sign-in (this is a shared venue device — one operator's drafts must not
  // survive into the next operator's session, same rationale as
  // wireOperatorCacheClear() in lib/auth/operator.ts). `enabled: false` only
  // suppresses *future* fetches; without this, whatever was already fetched
  // stays in state indefinitely. Reset to `status: 'loading'` rather than
  // `'ready'` with an empty array — an empty `drafts` under `'ready'` renders
  // the "you're all caught up" empty state, which is the wrong signal for
  // "we don't know yet, waiting on the next sign-in."
  useEffect(() => {
    if (!enabled) {
      setDrafts([]);
      setCommitments([]);
      setStatus('loading');
      setError(null);
    }
  }, [enabled]);

  // All realtime events trigger a reload — we don't patch state locally
  // because neither raw payload (`messages`, `guest_commitments`) carries the
  // JOINed fields the queue needs.
  const onRealtimeEvent = useCallback(
    (_event: QueueChannelEvent): void => {
      if (enabled) void reload();
    },
    [reload, enabled],
  );
  useQueueRealtime(onRealtimeEvent);

  const optimisticallyRemove = useCallback((messageId: string): void => {
    setDrafts((prev) => prev.filter((d) => d.messageId !== messageId));
  }, []);

  const restore = useCallback((draft: PendingDraft): void => {
    setDrafts((prev) => {
      if (prev.some((d) => d.messageId === draft.messageId)) return prev;
      return sortByPriority([...prev, draft]);
    });
  }, []);

  const optimisticallyRemoveCommitment = useCallback(
    (commitmentId: string): void => {
      setCommitments((prev) => prev.filter((c) => c.id !== commitmentId));
    },
    [],
  );

  const restoreCommitment = useCallback((commitment: HeadsUpCommitment): void => {
    setCommitments((prev) => {
      if (prev.some((c) => c.id === commitment.id)) return prev;
      return sortCommitments([...prev, commitment]);
    });
  }, []);

  // Memoized so the object identity is stable across renders. lib/queue-context
  // derives the venue-filtered view from this with useMemo; a fresh object
  // every render would re-run that filter (and hand QueueCardStack a new
  // `drafts` array) on every unrelated re-render.
  return useMemo(
    () => ({
      drafts,
      commitments,
      status,
      error,
      reload,
      optimisticallyRemove,
      restore,
      optimisticallyRemoveCommitment,
      restoreCommitment,
    }),
    [
      drafts,
      commitments,
      status,
      error,
      reload,
      optimisticallyRemove,
      restore,
      optimisticallyRemoveCommitment,
      restoreCommitment,
    ],
  );
}
