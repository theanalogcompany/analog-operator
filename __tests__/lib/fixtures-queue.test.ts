import {
  approveDraftFixture,
  editAndSendFixture,
  fixtureUuid,
  listQueueFixture,
  resetQueueFixture,
  skipDraftFixture,
  subscribeQueueFixture,
  triggerQueueAddedFixture,
  undoActionFixture,
} from '@/lib/fixtures/queue';
import { type PendingDraft } from '@/lib/api/queue';
import { type QueueChannelEvent } from '@/lib/realtime/queue-channel';

beforeEach(() => {
  resetQueueFixture();
});

function topMessageId(): string {
  return listQueueFixture()[0]?.messageId ?? '';
}

describe('lib/fixtures/queue idempotency', () => {
  it('seeds 3 drafts ordered FIFO by pendingSinceMs (largest first)', () => {
    const list = listQueueFixture();
    expect(list).toHaveLength(3);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].pendingSinceMs >= list[i].pendingSinceMs).toBe(true);
    }
  });

  it('approveDraft is idempotent on repeat calls', () => {
    const id = topMessageId();
    expect(approveDraftFixture(id).ok).toBe(true);
    expect(listQueueFixture().find((d) => d.messageId === id)).toBeUndefined();
    expect(approveDraftFixture(id).ok).toBe(true);
  });

  it('skipDraft is idempotent on repeat calls', () => {
    const id = topMessageId();
    expect(skipDraftFixture(id).ok).toBe(true);
    expect(skipDraftFixture(id).ok).toBe(true);
  });

  it('editAndSend same body is a no-op after the first', () => {
    const id = topMessageId();
    expect(editAndSendFixture(id, 'first version').ok).toBe(true);
    expect(editAndSendFixture(id, 'first version').ok).toBe(true);
    expect(listQueueFixture().find((d) => d.messageId === id)).toBeUndefined();
  });

  it('editAndSend with a different body replaces the archived body', () => {
    const id = topMessageId();
    expect(editAndSendFixture(id, 'first version').ok).toBe(true);
    expect(editAndSendFixture(id, 'revised version').ok).toBe(true);
  });

  it('undo restores a removed draft into the queue', () => {
    const id = topMessageId();
    approveDraftFixture(id);
    expect(listQueueFixture().find((d) => d.messageId === id)).toBeUndefined();
    undoActionFixture(id);
    expect(listQueueFixture().find((d) => d.messageId === id)).toBeDefined();
  });
});

describe('lib/fixtures/queue emitter', () => {
  it('triggerQueueAddedFixture inserts the draft AND emits queue_changed', () => {
    const events: QueueChannelEvent[] = [];
    const unsubscribe = subscribeQueueFixture((e) => events.push(e));

    const newDraft: PendingDraft = {
      messageId: fixtureUuid(),
      venueId: fixtureUuid(),
      venueSlug: 'mock-test-cafe',
      guestId: fixtureUuid(),
      guestDisplayName: 'Test Guest',
      guestPhoneFallback: '+15551110099',
      draftBody: 'hello!',
      category: null,
      voiceFidelity: 0.8,
      reviewReason: null,
      recognitionState: 'new',
      pendingSinceMs: 60_000,
      recentContext: [
        {
          id: fixtureUuid(),
          direction: 'inbound',
          body: 'hi',
          createdAt: new Date().toISOString(),
        },
      ],
      langfuseTraceId: null,
    };

    triggerQueueAddedFixture(newDraft);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'queue_changed' });
    expect(
      listQueueFixture().some((d) => d.messageId === newDraft.messageId),
    ).toBe(true);
    unsubscribe();
  });
});
