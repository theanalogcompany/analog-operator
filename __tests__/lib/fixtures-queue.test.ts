import {
  acknowledgeCommitmentFixture,
  approveDraftFixture,
  declineCommitmentFixture,
  editAndSendFixture,
  fixtureUuid,
  listCommitmentsFixture,
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
  it('seeds 8 drafts ordered FIFO by pendingSinceMs (largest first)', () => {
    // Four text drafts, plus TAC-486's four Instagram ones: Mia's three cards
    // for one guest (the sub-queue row, an urgent timer, a replaced draft) and
    // one expired card for an unnamed guest (slate, copy-and-open, the
    // blank-name case).
    const list = listQueueFixture();
    expect(list).toHaveLength(8);
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
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      replacedDraft: null,
      draftBody: 'hello!',
      category: null,
      voiceFidelity: 0.8,
      reviewReason: null,
      recognitionState: 'new',
      agentReasoning: null,
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
      reviewReasonCode: '',
      reviewTriggers: [],
      reviewTriggerLabels: [],
      ungroundedClaims: [],
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

describe('lib/fixtures/queue heads-up cards (TAC-364)', () => {
  it('seeds a comp with a code and a recommendation without one', () => {
    const list = listCommitmentsFixture();
    expect(list.map((c) => c.type)).toEqual(['comp', 'recommendation']);
    expect(list[0].code).toBeTruthy();
    expect(list[1].code).toBeNull();
  });

  it('acknowledge clears the card, and a repeat is a 409', () => {
    const id = listCommitmentsFixture()[0].id;
    expect(acknowledgeCommitmentFixture(id).ok).toBe(true);
    expect(listCommitmentsFixture().some((c) => c.id === id)).toBe(false);
    const again = acknowledgeCommitmentFixture(id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatchObject({ kind: 'HTTP', status: 409 });
  });

  it('decline clears the card and leaves a pending draft to review, not a send', () => {
    const c = listCommitmentsFixture()[0];
    const draftsBefore = listQueueFixture().length;
    const result = declineCommitmentFixture(c.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(listCommitmentsFixture().some((x) => x.id === c.id)).toBe(false);
    const draft = listQueueFixture().find(
      (d) => d.messageId === result.data.messageId,
    );
    expect(draft?.draftBody).toBe(result.data.body);
    expect(draft?.guestId).toBe(c.guestId);
    expect(listQueueFixture()).toHaveLength(draftsBefore + 1);
  });
});
