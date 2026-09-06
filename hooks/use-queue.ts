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

export function useQueue(options?: { enabled?: boolean }): UseQueueResult {
  const enabled = options?.enabled ?? true;
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [status, setStatus] = useState<QueueStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setStatus('loading');
    setError(null);
    const result = await listQueue();
    if (!mounted.current) return;
    if (result.ok) {
      setDrafts(sortByPriority(result.data));
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
      setStatus('loading');
      setError(null);
    }
  }, [enabled]);

  // All realtime events trigger a reload — we don't patch state locally
  // because the raw `messages` payload doesn't carry the JOINed
  // PendingDraft fields the queue needs.
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

  return { drafts, status, error, reload, optimisticallyRemove, restore };
}
