import { useEffect } from 'react';

import {
  type QueueChannelEvent,
  createQueueChannel,
} from '@/lib/realtime/queue-channel';

/**
 * Subscribes to the queue realtime channel for the lifetime of the host
 * component and forwards every event to `onEvent`. The hook never touches
 * edit-takeover input state — that lives in a separate component's local
 * state, structurally insulated from this stream.
 */
export function useQueueRealtime(
  onEvent: (event: QueueChannelEvent) => void,
): void {
  useEffect(() => {
    const channel = createQueueChannel();
    return channel.subscribe(onEvent);
  }, [onEvent]);
}
