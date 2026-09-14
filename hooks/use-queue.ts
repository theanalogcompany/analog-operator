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

// Queue priority: most important guest first, then oldest-waiting within a
// tier. `recognitionState` ranks raving_fan > regular > returning > new; a
// null/unknown tier sorts last. `pendingSinceMs` is elapsed ms since the draft
// was created, so larger = older and breaks ties oldest-first.
const TIER_RANK: Record<string, number> = {
  raving_fan: 3,
  regular: 2,
  returning: 1,
  new: 0,
};

function importanceRank(draft: PendingDraft): number {
  return draft.recognitionState ? (TIER_RANK[draft.recognitionState] ?? -1) : -1;
}

function sortByPriority(list: PendingDraft[]): PendingDraft[] {
  return [...list].sort((a, b) => {
    const byImportance = importanceRank(b) - importanceRank(a);
    if (byImportance !== 0) return byImportance;
    return b.pendingSinceMs - a.pendingSinceMs;
  });
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
