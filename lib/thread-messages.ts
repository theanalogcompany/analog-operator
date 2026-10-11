import { type ThreadMessage } from '@/lib/api/queue';

/**
 * How an open thread's message list changes: a live row merged in, a row that
 * stopped counting removed, and a fetch reconciled against what arrived while
 * it was out.
 *
 * The edit takeover and the Conversations thread each held their own copy of
 * the first three, kept in step by hand. TAC-583 changed what a merge has to
 * preserve (attachments) and added a second kind of fetch (a refetch), and two
 * copies of that would be two chances to get it wrong on one screen only, so
 * they live here now. Pure, so the rules are tested without a screen.
 */

/**
 * Replace-by-id for a message already in the list, otherwise insert at the
 * correct chronological position. Used for Realtime INSERTs (where the echo of
 * an optimistic send, or a duplicate delivery, dedupes against itself) and
 * UPDATEs (where a row mutates after being seen).
 *
 * **A replacement keeps the attachments it cannot see.** A live row carries no
 * attachment data, so its `attachments` and `unsupported` are absent, not
 * empty. Replacing wholesale would strip the photo off a message the moment
 * its row was touched, until the next fetch put it back. Absent means "this
 * source doesn't know", and the fetched value stands. A fetched message always
 * carries both fields, so a refetch still overwrites them.
 */
export function mergeThreadMessage(
  current: ThreadMessage[],
  next: ThreadMessage,
): ThreadMessage[] {
  const existingIdx = current.findIndex((m) => m.id === next.id);
  if (existingIdx >= 0) {
    const existing = current[existingIdx];
    const out = current.slice();
    out[existingIdx] = {
      ...next,
      attachments: next.attachments ?? existing.attachments,
      unsupported: next.unsupported ?? existing.unsupported,
    };
    return out;
  }
  const nextMs = Date.parse(next.createdAt);
  for (let i = current.length - 1; i >= 0; i--) {
    if (Date.parse(current[i].createdAt) <= nextMs) {
      return [...current.slice(0, i + 1), next, ...current.slice(i + 1)];
    }
  }
  return [next, ...current];
}

/**
 * Drop a message that stopped counting. The channel decides — see
 * `countsAsThreadRow` in lib/realtime/thread-channel.ts — and this only applies
 * the verdict. Returns `current` untouched when the id isn't present, so React
 * skips the re-render. (TAC-411.)
 */
export function removeThreadMessage(
  current: ThreadMessage[],
  id: string,
): ThreadMessage[] {
  const idx = current.findIndex((m) => m.id === id);
  if (idx < 0) return current;
  return [...current.slice(0, idx), ...current.slice(idx + 1)];
}

/**
 * The FIRST fetch of a thread, reconciled against the Realtime messages that
 * landed while it was out. The server response is authoritative; only ids it
 * doesn't carry are added, so a live arrival that beat the response back is
 * not dropped.
 */
export function reconcileFetchedThread(
  fetched: ThreadMessage[],
  liveDuringLoad: ThreadMessage[],
): ThreadMessage[] {
  if (liveDuringLoad.length === 0) return fetched;
  const fetchedIds = new Set(fetched.map((m) => m.id));
  const survivors = liveDuringLoad.filter((m) => !fetchedIds.has(m.id));
  if (survivors.length === 0) return fetched;
  return survivors.reduce<ThreadMessage[]>(
    (acc, m) => mergeThreadMessage(acc, m),
    fetched,
  );
}

/**
 * A LATER fetch of a thread already on screen, reconciled against it.
 *
 * Not the same rule as the first fetch, and using that one here would be a
 * bug. On a first fetch everything on screen that the response lacks is a live
 * arrival, so keeping it is right. On a refetch the screen holds the whole
 * previous thread, so "everything the response lacks" also includes every
 * message the server has since stopped returning, and keeping those would
 * resurrect them on each refetch.
 *
 * So a message the response lacks survives only when it is NEWER than the
 * newest message the response carries, which is the one case a snapshot can
 * legitimately lack it: it arrived after the snapshot was taken. Anything older
 * was in the server's view when it answered and was left out on purpose.
 *
 * An empty response is taken as it is. With nothing to compare against there is
 * no way to tell a late arrival from a removed row, and the server saying the
 * thread is empty is the stronger claim.
 */
export function reconcileRefetchedThread(
  fetched: ThreadMessage[],
  onScreen: ThreadMessage[],
): ThreadMessage[] {
  if (fetched.length === 0 || onScreen.length === 0) return fetched;
  const fetchedIds = new Set(fetched.map((m) => m.id));
  const newestFetchedMs = fetched.reduce(
    (max, m) => Math.max(max, Date.parse(m.createdAt)),
    Number.NEGATIVE_INFINITY,
  );
  const lateArrivals = onScreen.filter(
    (m) => !fetchedIds.has(m.id) && Date.parse(m.createdAt) > newestFetchedMs,
  );
  if (lateArrivals.length === 0) return fetched;
  return lateArrivals.reduce<ThreadMessage[]>(
    (acc, m) => mergeThreadMessage(acc, m),
    fetched,
  );
}
