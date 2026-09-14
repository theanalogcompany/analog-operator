import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConversationsRealtime } from '@/hooks/use-conversations-realtime';
import { type ConversationSummary, listConversations } from '@/lib/api/conversations';
import { type ApiError } from '@/lib/api/errors';
import { type ConversationsChannelEvent } from '@/lib/realtime/conversations-channel';

export type ConversationsStatus = 'loading' | 'ready' | 'error';

export type UseConversationsResult = {
  conversations: ConversationSummary[];
  status: ConversationsStatus;
  error: ApiError | null;
  reload: () => Promise<void>;
};

// Newest activity first — smallest "mins since last message" sorts first,
// which is equivalent to sorting lastMessageAt descending.
function sortByRecency(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [status, setStatus] = useState<ConversationsStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    setStatus('loading');
    setError(null);
    const result = await listConversations();
    if (!mounted.current) return;
    if (result.ok) {
      setConversations(sortByRecency(result.data));
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

  const onRealtimeEvent = useCallback(
    (_event: ConversationsChannelEvent): void => {
      void reload();
    },
    [reload],
  );
  useConversationsRealtime(onRealtimeEvent);

  // Memoized for the same reason as useQueue's return — see the note there.
  return useMemo(
    () => ({ conversations, status, error, reload }),
    [conversations, status, error, reload],
  );
}
