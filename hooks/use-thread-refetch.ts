import { useCallback, useRef, useState } from 'react';

import { type ThreadMessage } from '@/lib/api/queue';
import { isPastUrlExpiry } from '@/lib/media-variant';

export type ThreadRefetch = {
  /** Changes whenever the thread should be fetched again. An effect dependency. */
  tick: number;
  /** A live row with media arrived or changed. */
  refetch: () => void;
  /** A media file failed to load after its signed URL ran out. */
  onMediaUrlExpired: (attachmentId: string) => void;
  /** Tell the hook how a fetch ended, so it can release what it is holding. */
  onFetched: (messages: readonly ThreadMessage[]) => void;
  onFetchFailed: () => void;
};

/**
 * When an open thread fetches itself again. Shared by the edit takeover and
 * the Conversations thread, which must not answer this differently. (TAC-583.)
 *
 * Two things ask: the live channel, when a row with media arrives or changes,
 * and a media tile, when its file fails to load after its signed URL expired.
 * Both only bump `tick`. A bump while a fetch is out abandons that fetch for a
 * newer one (the effect's own cancel flag), so a burst settles on the last
 * response.
 *
 * **A tile gets one refetch per expiry, not one per failure.** A file that is
 * simply broken fails again on every fresh URL, and would otherwise refetch the
 * thread for ever. The memory is released in the two cases where asking again
 * is right: the refetch itself failed, so nothing was tried, and the fetch came
 * back with a URL that has not expired, so a later failure is a new expiry.
 *
 * Callbacks are identity-stable. `useThreadRealtime` reopens its channel when a
 * handler changes identity.
 */
export function useThreadRefetch(): ThreadRefetch {
  const [tick, setTick] = useState(0);
  const askedFor = useRef<Set<string>>(new Set());

  const refetch = useCallback(() => {
    setTick((current) => current + 1);
  }, []);

  const onMediaUrlExpired = useCallback((attachmentId: string) => {
    if (askedFor.current.has(attachmentId)) return;
    askedFor.current.add(attachmentId);
    setTick((current) => current + 1);
  }, []);

  const onFetched = useCallback((messages: readonly ThreadMessage[]) => {
    if (askedFor.current.size === 0) return;
    const now = Date.now();
    for (const message of messages) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.url !== null && !isPastUrlExpiry(attachment, now)) {
          askedFor.current.delete(attachment.id);
        }
      }
    }
  }, []);

  const onFetchFailed = useCallback(() => {
    askedFor.current.clear();
  }, []);

  return { tick, refetch, onMediaUrlExpired, onFetched, onFetchFailed };
}
