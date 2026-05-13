import {
  approveDraftFixture,
  editAndSendFixture,
  listQueueFixture,
  resetQueueFixture,
  skipDraftFixture,
  subscribeQueueFixture,
  triggerDraftRegeneratedFixture,
  triggerGuestMessageFixture,
  triggerQueueAddedFixture,
  undoActionFixture,
  type QueueChannelEvent,
} from '@/lib/fixtures/queue';
import { type PendingDraft } from '@/lib/api/queue';

beforeEach(() => {
  resetQueueFixture();
});

function topMessageId(): string {
  return listQueueFixture()[0]?.id ?? '';
}

describe('lib/fixtures/queue idempotency', () => {
  it('seeds 3 drafts ordered FIFO by created_at', () => {
    const list = listQueueFixture();
    expect(list).toHaveLength(3);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].created_at <= list[i].created_at).toBe(true);
    }
  });

  it('approveDraft is idempotent on repeat calls', () => {
    const id = topMessageId();
    expect(approveDraftFixture(id).ok).toBe(true);
    expect(listQueueFixture().find((d) => d.id === id)).toBeUndefined();
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
    expect(listQueueFixture().find((d) => d.id === id)).toBeUndefined();
  });

  it('editAndSend with a different body replaces the archived body', () => {
    const id = topMessageId();
    expect(editAndSendFixture(id, 'first version').ok).toBe(true);
    expect(editAndSendFixture(id, 'revised version').ok).toBe(true);
  });

  it('undo restores a removed draft into the queue', () => {
    const id = topMessageId();
    approveDraftFixture(id);
    expect(listQueueFixture().find((d) => d.id === id)).toBeUndefined();
    undoActionFixture(id);
    expect(listQueueFixture().find((d) => d.id === id)).toBeDefined();
  });
});

describe('lib/fixtures/queue emitter', () => {
  it('emits queue_added with the expected shape', () => {
    const events: QueueChannelEvent[] = [];
    const unsubscribe = subscribeQueueFixture((e) => events.push(e));

    const newDraft: PendingDraft = {
      id: '44d7a2f4-5c6b-4d8e-ae9f-1c2d3e4f5a6b',
      guest_id: '54d7a2f4-5c6b-4d8e-ae9f-1c2d3e4f5a6b',
      guest_name: 'Test Guest',
      guest_phone: '+15551110099',
      recognition_band: 'guest',
      recognition_signals: [],
      context_messages: [],
      current_inbound: {
        id: '55d7a2f4-5c6b-4d8e-ae9f-1c2d3e4f5a6b',
        body: 'hi',
        direction: 'inbound',
        created_at: new Date().toISOString(),
      },
      agent_draft: 'hello!',
      agent_reasoning: null,
      flag_reason: null,
      pending_since: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    triggerQueueAddedFixture(newDraft);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'queue_added', draft: newDraft });
    unsubscribe();
  });

  it('emits guest_message and updates the queue draft', () => {
    const id = topMessageId();
    const events: QueueChannelEvent[] = [];
    const unsubscribe = subscribeQueueFixture((e) => events.push(e));

    triggerGuestMessageFixture(id, 'follow-up');
    expect(events[0].type).toBe('guest_message');
    const updated = listQueueFixture().find((d) => d.id === id);
    expect(updated?.current_inbound.body).toBe('follow-up');
    unsubscribe();
  });

  it('emits draft_regenerated and updates the agent_draft', () => {
    const id = topMessageId();
    const events: QueueChannelEvent[] = [];
    const unsubscribe = subscribeQueueFixture((e) => events.push(e));

    triggerDraftRegeneratedFixture(id, 'fresh', 'fresh reasoning');
    expect(events[0].type).toBe('draft_regenerated');
    const updated = listQueueFixture().find((d) => d.id === id);
    expect(updated?.agent_draft).toBe('fresh');
    expect(updated?.agent_reasoning).toBe('fresh reasoning');
    unsubscribe();
  });
});
