import { isFixtureMode } from '@/lib/api/queue';
import {
  type QueueChannelEvent,
  subscribeQueueFixture,
} from '@/lib/fixtures/queue';

export type { QueueChannelEvent };

export type QueueChannel = {
  subscribe: (onEvent: (event: QueueChannelEvent) => void) => () => void;
};

const noopChannel: QueueChannel = {
  subscribe: () => () => {
    /* no-op */
  },
};

/**
 * Returns a channel that emits live queue events. In fixture mode, delegates
 * to the in-memory emitter from `@/lib/fixtures/queue`. When the real backend
 * lands (TAC-264), swap this factory to wire a Supabase Realtime subscription
 * on the `messages` table filtered to pending status. The hooks above this
 * boundary do not need to change.
 */
export function createQueueChannel(): QueueChannel {
  if (isFixtureMode()) {
    return {
      subscribe: (onEvent) => subscribeQueueFixture(onEvent),
    };
  }
  // [HUMAN-REVIEW-REQUIRED at TAC-264 integration time] Wire Supabase Realtime here.
  return noopChannel;
}
