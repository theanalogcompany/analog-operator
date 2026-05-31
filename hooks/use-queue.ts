import { useCallback, useEffect, useRef, useState } from 'react';

import { useQueueRealtime } from '@/hooks/use-queue-realtime';
import { type ApiError } from '@/lib/api/errors';
import { type PendingDraft, listQueue } from '@/lib/api/queue';
import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { type QueueChannelEvent } from '@/lib/realtime/queue-channel';

export type QueueStatus = 'loading' | 'ready' | 'error';

/**
 * Reload options. `silent: true` skips the visible `status` transitions —
 * the queue stays on its current `ready` view while the refetch is in
 * flight, and a failure does NOT flip the queue to `error` (which would
 * wipe the visible cards). Used when the caller has a follow-up navigation
 * that needs the latest server state in `queue.drafts` (TAC-298 UAT #3:
 * swipe-left → draft-decline → reload({silent}) → router.push edit screen)
 * but doesn't want the queue to flash a loading spinner mid-swipe.
 *
 * Silent callers MUST branch on the returned `{ok}` — `reload` swallows
 * errors at the screen level in silent mode, so the caller is the only
 * surface that can recover. Navigating to an edit screen on a silent
 * failure leaves the operator at the "no longer pending" fallback (the
 * exact UAT #3 bug); a non-silent failure flips status to 'error' and the
 * queue screen renders the retry UI itself.
 */
export type ReloadOptions = { silent?: boolean };
export type ReloadResult = { ok: boolean };

export type UseQueueResult = {
  drafts: PendingDraft[];
  commitments: HeadsUpCommitment[];
  status: QueueStatus;
  error: ApiError | null;
  reload: (options?: ReloadOptions) => Promise<ReloadResult>;
  /** Remove a draft from the local list (after a swipe commit, before the API resolves). */
  optimisticallyRemoveDraft: (messageId: string) => void;
  /** Restore a draft into the local list (called on API failure or undo). */
  restoreDraft: (draft: PendingDraft) => void;
  /** Remove a commitment from the local list (after swipe-right / swipe-left). */
  optimisticallyRemoveCommitment: (commitmentId: string) => void;
  /** Restore a commitment (called on API failure for the acknowledge or decline path,
   *  EXCEPT the decline 409 case — that's an already-cancelled signal, no restore). */
  restoreCommitment: (commitment: HeadsUpCommitment) => void;
};

// FIFO: `pendingSinceMs` is elapsed milliseconds since the draft was
// created, so larger values are older and sort first.
function sortByPendingDesc(list: PendingDraft[]): PendingDraft[] {
  return [...list].sort((a, b) => b.pendingSinceMs - a.pendingSinceMs);
}

// FIFO for commitments: older `created_at` first. Wire is ISO string.
function sortCommitmentsByCreatedAsc(
  list: HeadsUpCommitment[],
): HeadsUpCommitment[] {
  return [...list].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export function useQueue(): UseQueueResult {
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [commitments, setCommitments] = useState<HeadsUpCommitment[]>([]);
  const [status, setStatus] = useState<QueueStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(
    async (options: ReloadOptions = {}): Promise<ReloadResult> => {
      if (!options.silent) {
        setStatus('loading');
        setError(null);
      }
      const result = await listQueue();
      if (!mounted.current) return { ok: false };
      if (result.ok) {
        setDrafts(sortByPendingDesc(result.data.drafts));
        setCommitments(sortCommitmentsByCreatedAsc(result.data.commitments));
        setStatus('ready');
        return { ok: true };
      }
      if (!options.silent) {
        setError(result.error);
        setStatus('error');
      }
      // Silent failure: leave the queue on its current `ready` view rather
      // than wiping it to the error screen. The caller (e.g.
      // app/queue/index.tsx::handleDecline) MUST branch on `{ok}` to
      // decide how to recover.
      return { ok: false };
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  // All realtime events trigger a reload — we don't patch state locally
  // because the raw `messages` / `guest_commitments` payloads don't carry
  // the joined fields the queue needs.
  const onRealtimeEvent = useCallback(
    (_event: QueueChannelEvent): void => {
      void reload();
    },
    [reload],
  );
  useQueueRealtime(onRealtimeEvent);

  const optimisticallyRemoveDraft = useCallback((messageId: string): void => {
    setDrafts((prev) => prev.filter((d) => d.messageId !== messageId));
  }, []);

  const restoreDraft = useCallback((draft: PendingDraft): void => {
    setDrafts((prev) => {
      if (prev.some((d) => d.messageId === draft.messageId)) return prev;
      return sortByPendingDesc([...prev, draft]);
    });
  }, []);

  const optimisticallyRemoveCommitment = useCallback(
    (commitmentId: string): void => {
      setCommitments((prev) => prev.filter((c) => c.id !== commitmentId));
    },
    [],
  );

  const restoreCommitment = useCallback(
    (commitment: HeadsUpCommitment): void => {
      setCommitments((prev) => {
        if (prev.some((c) => c.id === commitment.id)) return prev;
        return sortCommitmentsByCreatedAsc([...prev, commitment]);
      });
    },
    [],
  );

  return {
    drafts,
    commitments,
    status,
    error,
    reload,
    optimisticallyRemoveDraft,
    restoreDraft,
    optimisticallyRemoveCommitment,
    restoreCommitment,
  };
}
