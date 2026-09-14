import { useEffect, useState } from 'react';

import { type ThreadMessage, getThread } from '@/lib/api/queue';

/**
 * The conversation behind a heads-up card, fetched through the same full-thread
 * endpoint the edit takeover uses, keyed on the commitment's `sourceMessageId`.
 *
 * A commitment carries no `recentContext` of its own, so without this the card
 * would show a promise with no sign of what the guest actually said. Only the
 * front card asks (`enabled`), so a deck of heads-up cards costs one fetch at a
 * time rather than one per card. A failed or missing fetch renders no bubbles;
 * the commitment block still says everything the operator has to act on.
 * (TAC-364, carrying TAC-298.)
 */
export function useCommitmentThread(
  sourceMessageId: string | null,
  enabled: boolean,
): ThreadMessage[] {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);

  useEffect(() => {
    if (!enabled || !sourceMessageId) return;
    let cancelled = false;
    void (async () => {
      const result = await getThread(sourceMessageId);
      if (cancelled) return;
      setMessages(result.ok ? result.data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceMessageId, enabled]);

  return enabled && sourceMessageId ? messages : [];
}
