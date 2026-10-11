import { type Attachment, type ThreadMessage } from '@/lib/api/queue';
import {
  mergeThreadMessage,
  reconcileFetchedThread,
  reconcileRefetchedThread,
  removeThreadMessage,
} from '@/lib/thread-messages';

const PHOTO: Attachment = {
  id: 'a1',
  kind: 'image',
  status: 'ready',
  url: 'https://project.supabase.co/storage/v1/object/sign/guest-media/a1',
  urlExpiresAt: '2026-10-11T18:12:33.000Z',
  mimeType: 'image/jpeg',
  title: null,
  linkUrl: null,
};

function at(minute: number): string {
  return new Date(Date.parse('2026-10-11T17:00:00.000Z') + minute * 60_000).toISOString();
}

function msg(id: string, minute: number, extra: Partial<ThreadMessage> = {}): ThreadMessage {
  return { id, direction: 'inbound', body: id, createdAt: at(minute), ...extra };
}

const ids = (messages: ThreadMessage[]): string[] => messages.map((m) => m.id);

describe('mergeThreadMessage', () => {
  it('inserts a new message at its place in time', () => {
    const current = [msg('a', 0), msg('c', 10)];
    expect(ids(mergeThreadMessage(current, msg('b', 5)))).toEqual(['a', 'b', 'c']);
    expect(ids(mergeThreadMessage(current, msg('d', 20)))).toEqual(['a', 'c', 'd']);
    expect(ids(mergeThreadMessage(current, msg('z', -5)))).toEqual(['z', 'a', 'c']);
  });

  it('replaces a message already in the list rather than adding it twice', () => {
    const current = [msg('a', 0), msg('b', 5)];
    const merged = mergeThreadMessage(current, msg('b', 5, { body: 'edited' }));
    expect(ids(merged)).toEqual(['a', 'b']);
    expect(merged[1].body).toBe('edited');
  });

  /**
   * The defect this rule exists for: a live `messages` row carries no
   * attachment data, so a row touched after its photo was fetched would
   * replace the message with one that has no photo.
   */
  it('keeps the attachments of a message when the incoming copy does not carry any', () => {
    const fetched = msg('photo', 5, {
      body: 'look',
      attachments: [PHOTO],
      unsupported: false,
    });
    // What `rowToMessage` builds from a live row: no attachment fields at all.
    const liveRow = msg('photo', 5, { body: 'look!' });

    const [merged] = mergeThreadMessage([fetched], liveRow);
    expect(merged.body).toBe('look!');
    expect(merged.attachments).toEqual([PHOTO]);
    expect(merged.unsupported).toBe(false);
  });

  it('keeps the unsupported flag the same way', () => {
    const fetched = msg('odd', 5, { body: '', attachments: [], unsupported: true });
    const [merged] = mergeThreadMessage([fetched], msg('odd', 5, { body: '' }));
    expect(merged.unsupported).toBe(true);
  });

  it('lets a copy that DOES carry attachments overwrite them, including with none', () => {
    const fetched = msg('photo', 5, { attachments: [PHOTO], unsupported: false });
    const ready = { ...PHOTO, url: 'https://project.supabase.co/fresh' };

    const [refreshed] = mergeThreadMessage(
      [fetched],
      msg('photo', 5, { attachments: [ready], unsupported: false }),
    );
    expect(refreshed.attachments).toEqual([ready]);

    // An explicit empty array is the server saying there are none.
    const [emptied] = mergeThreadMessage(
      [fetched],
      msg('photo', 5, { attachments: [], unsupported: false }),
    );
    expect(emptied.attachments).toEqual([]);
  });
});

describe('removeThreadMessage', () => {
  it('drops the message with that id', () => {
    expect(ids(removeThreadMessage([msg('a', 0), msg('b', 5)], 'a'))).toEqual(['b']);
  });

  it('returns the same array when the id is not present, so nothing re-renders', () => {
    const current = [msg('a', 0)];
    expect(removeThreadMessage(current, 'nope')).toBe(current);
  });
});

describe('reconcileFetchedThread, the first fetch', () => {
  it('takes the response as it is when nothing arrived meanwhile', () => {
    const fetched = [msg('a', 0)];
    expect(reconcileFetchedThread(fetched, [])).toBe(fetched);
  });

  it('keeps a live arrival the response does not carry', () => {
    const merged = reconcileFetchedThread([msg('a', 0)], [msg('live', 5)]);
    expect(ids(merged)).toEqual(['a', 'live']);
  });

  it('prefers the response for a message both hold', () => {
    const merged = reconcileFetchedThread(
      [msg('a', 0, { body: 'server', attachments: [PHOTO] })],
      [msg('a', 0, { body: 'seed' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe('server');
    expect(merged[0].attachments).toEqual([PHOTO]);
  });
});

describe('reconcileRefetchedThread, a later fetch of a thread already on screen', () => {
  it('replaces attachments with the fresh ones: this is how pending becomes ready', () => {
    const pending = { ...PHOTO, status: 'pending' as const, url: null, urlExpiresAt: null };
    const onScreen = [msg('photo', 5, { body: '', attachments: [pending] })];
    const fetched = [msg('photo', 5, { body: '', attachments: [PHOTO] })];

    const merged = reconcileRefetchedThread(fetched, onScreen);
    expect(merged[0].attachments).toEqual([PHOTO]);
  });

  /**
   * The reason this is not `reconcileFetchedThread`. On a refetch the screen
   * holds the whole previous thread, so "keep what the response lacks" would
   * bring back every message the server has stopped returning.
   */
  it('does not resurrect a message the server has stopped returning', () => {
    const onScreen = [msg('a', 0), msg('gone', 5), msg('c', 10)];
    const fetched = [msg('a', 0), msg('c', 10)];

    expect(ids(reconcileRefetchedThread(fetched, onScreen))).toEqual(['a', 'c']);
    // The first-fetch rule would have kept it, which is the bug being avoided.
    expect(ids(reconcileFetchedThread(fetched, onScreen))).toEqual(['a', 'gone', 'c']);
  });

  it('keeps a message newer than everything in the response: it arrived after the snapshot', () => {
    const onScreen = [msg('a', 0), msg('late', 20)];
    const fetched = [msg('a', 0), msg('b', 10)];

    expect(ids(reconcileRefetchedThread(fetched, onScreen))).toEqual(['a', 'b', 'late']);
  });

  it('takes an empty response as it is', () => {
    expect(reconcileRefetchedThread([], [msg('a', 0)])).toEqual([]);
  });

  it('takes the response as it is when the screen was empty', () => {
    const fetched = [msg('a', 0)];
    expect(reconcileRefetchedThread(fetched, [])).toBe(fetched);
  });
});
