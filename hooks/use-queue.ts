import { useCallback, useEffect, useRef, useState } from 'react';

import { useQueueRealtime } from '@/hooks/use-queue-realtime';
import { type ApiError } from '@/lib/api/errors';
import { type PendingDraft, listQueue } from '@/lib/api/queue';
import { type QueueChannelEvent } from '@/lib/realtime/queue-channel';

export type QueueStatus = 'loading' | 'ready' | 'error';

export type UseQueueResult = {
  drafts: PendingDraft[];
  status: QueueStatus;
  error: ApiError | null;
  reload: () => Promise<void>;
  /** Remove a draft from the local list (after a swipe commit, before the API resolves). */
  optimisticallyRemove: (messageId: string) => void;
  /** Restore a draft into the local list (called on API failure or undo). */
  restore: (draft: PendingDraft) => void;
};

// FIFO: `pendingSinceMs` is elapsed milliseconds since the draft was
// created, so larger values are older and sort first.
function sortByPendingDesc(list: PendingDraft[]): PendingDraft[] {
  return [...list].sort((a, b) => b.pendingSinceMs - a.pendingSinceMs);
}

export function useQueue(): UseQueueResult {
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [status, setStatus] = useState<QueueStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    setStatus('loading');
    setError(null);
    const result = await listQueue();
    if (!mounted.current) return;
    if (result.ok) {
      setDrafts(sortByPendingDesc(result.data));
      setStatus('ready');
    } else {
      setError(result.error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  // All realtime events trigger a reload — we don't patch state locally
  // because the raw `messages` payload doesn't carry the JOINed
  // PendingDraft fields the queue needs.
  const onRealtimeEvent = useCallback(
    (_event: QueueChannelEvent): void => {
      void reload();
    },
    [reload],
  );
  useQueueRealtime(onRealtimeEvent);

  const optimisticallyRemove = useCallback((messageId: string): void => {
    setDrafts((prev) => prev.filter((d) => d.messageId !== messageId));
  }, []);

  const restore = useCallback((draft: PendingDraft): void => {
    setDrafts((prev) => {
      if (prev.some((d) => d.messageId === draft.messageId)) return prev;
      return sortByPendingDesc([...prev, draft]);
    });
  }, []);

  return { drafts, status, error, reload, optimisticallyRemove, restore };
}
