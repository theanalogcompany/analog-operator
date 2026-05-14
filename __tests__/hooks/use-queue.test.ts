import { applyEvent } from '@/hooks/use-queue';
import { type PendingDraft } from '@/lib/api/queue';
import { type QueueChannelEvent } from '@/lib/realtime/queue-channel';

function makeDraft(id: string, createdAt: string, overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    id,
    guest_id: id.replace(/^./, 'a'),
    guest_name: null,
    guest_phone: '+15550000000',
    recognition_band: 'guest',
    recognition_signals: [],
    context_messages: [],
    current_inbound: {
      id: `inbound-${id}`,
      body: 'inbound',
      direction: 'inbound',
      created_at: createdAt,
    },
    agent_draft: 'draft',
    agent_reasoning: null,
    flag_reason: null,
    pending_since: createdAt,
    created_at: createdAt,
    ...overrides,
  };
}

describe('use-queue applyEvent merge logic', () => {
  it('appends a new draft FIFO on queue_added (slots behind by created_at)', () => {
    const a = makeDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', '2026-05-13T16:00:00.000Z');
    const b = makeDraft('22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e', '2026-05-13T16:30:00.000Z');
    const event: QueueChannelEvent = {
      type: 'queue_added',
      draft: b,
    };
    const next = applyEvent([a], event);
    expect(next.map((d) => d.id)).toEqual([a.id, b.id]);
  });

  it('appends an inbound on guest_message, preserving the prior current_inbound in context', () => {
    const a = makeDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', '2026-05-13T16:00:00.000Z');
    const newInbound = {
      id: 'follow-up-id',
      body: 'follow-up question',
      direction: 'inbound' as const,
      created_at: '2026-05-13T16:05:00.000Z',
    };
    const next = applyEvent([a], {
      type: 'guest_message',
      message_id: a.id,
      inbound: newInbound,
    });
    expect(next[0].current_inbound).toEqual(newInbound);
    expect(next[0].context_messages).toContain(a.current_inbound);
  });

  it('updates the agent draft and reasoning on draft_regenerated', () => {
    const a = makeDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', '2026-05-13T16:00:00.000Z');
    const next = applyEvent([a], {
      type: 'draft_regenerated',
      message_id: a.id,
      agent_draft: 'rewritten',
      agent_reasoning: 'because new context',
    });
    expect(next[0].agent_draft).toBe('rewritten');
    expect(next[0].agent_reasoning).toBe('because new context');
  });

  it('drops events for unknown message_ids silently', () => {
    const a = makeDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', '2026-05-13T16:00:00.000Z');
    const next = applyEvent([a], {
      type: 'draft_regenerated',
      message_id: '33c6f1e3-4b5a-4c7d-9d8f-0b1c2d3e4f5a',
      agent_draft: 'should not apply',
      agent_reasoning: null,
    });
    expect(next).toEqual([a]);
  });

  it('does not duplicate a queue_added if the draft already exists', () => {
    const a = makeDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', '2026-05-13T16:00:00.000Z');
    const next = applyEvent([a], { type: 'queue_added', draft: a });
    expect(next).toHaveLength(1);
  });

  it('returns the same array reference on queue_changed — the consumer reloads instead', () => {
    const a = makeDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', '2026-05-13T16:00:00.000Z');
    const prev = [a];
    const next = applyEvent(prev, { type: 'queue_changed' });
    expect(next).toBe(prev);
  });
});
