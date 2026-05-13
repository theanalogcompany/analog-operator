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
  /** Restore a draft into the local list at FIFO position (called on API failure or undo). */
  restore: (draft: PendingDraft) => void;
};

function sortByCreatedAt(list: PendingDraft[]): PendingDraft[] {
  return [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

function applyEvent(prev: PendingDraft[], event: QueueChannelEvent): PendingDraft[] {
  switch (event.type) {
    case 'queue_added': {
      if (prev.some((d) => d.id === event.draft.id)) return prev;
      return sortByCreatedAt([...prev, event.draft]);
    }
    case 'guest_message': {
      const idx = prev.findIndex((d) => d.id === event.message_id);
      if (idx === -1) return prev;
      const target = prev[idx];
      const next = [...prev];
      next[idx] = {
        ...target,
        context_messages: [...target.context_messages, target.current_inbound],
        current_inbound: event.inbound,
      };
      return next;
    }
    case 'draft_regenerated': {
      const idx = prev.findIndex((d) => d.id === event.message_id);
      if (idx === -1) return prev;
      const target = prev[idx];
      const next = [...prev];
      next[idx] = {
        ...target,
        agent_draft: event.agent_draft,
        agent_reasoning: event.agent_reasoning,
      };
      return next;
    }
  }
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
      setDrafts(sortByCreatedAt(result.data));
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

  const onRealtimeEvent = useCallback((event: QueueChannelEvent): void => {
    setDrafts((prev) => applyEvent(prev, event));
  }, []);
  useQueueRealtime(onRealtimeEvent);

  const optimisticallyRemove = useCallback((messageId: string): void => {
    setDrafts((prev) => prev.filter((d) => d.id !== messageId));
  }, []);

  const restore = useCallback((draft: PendingDraft): void => {
    setDrafts((prev) => {
      if (prev.some((d) => d.id === draft.id)) return prev;
      return sortByCreatedAt([...prev, draft]);
    });
  }, []);

  return { drafts, status, error, reload, optimisticallyRemove, restore };
}

export { applyEvent };
