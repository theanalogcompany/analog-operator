import { type HeadsUpCommitment, type PendingDraft } from '@/lib/api/queue';
import { draftItem, headsUpItem } from '@/lib/queue-items';
import { subQueueLabel, subQueuePositionFor } from '@/lib/sub-queue';

const MIA = 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';
const JORDAN = 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';

function draft(messageId: string, guestId: string): PendingDraft {
  return {
    messageId,
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock',
    venueTimezone: null,
    guestId,
    guestDisplayName: 'Mia B.',
    guestPhoneFallback: '',
    guestChannel: 'instagram',
    replyWindowExpiresAt: null,
    instagramUsername: 'mia.brews',
    replacedDraft: null,
    draftBody: 'body',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 0,
    recentContext: [],
    langfuseTraceId: null,
  };
}

function commitment(id: string, guestId: string): HeadsUpCommitment {
  return {
    id,
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestId,
    type: 'comp',
    guest: { name: 'Mia' },
    description: 'a cortado',
    code: null,
    expected_arrival: null,
    created_at: null,
    recognitionState: null,
    sourceMessageId: null,
  };
}

const a = draftItem(draft('11111111-1111-4111-8111-111111111111', MIA));
const b = draftItem(draft('22222222-2222-4222-8222-222222222222', MIA));
const c = draftItem(draft('33333333-3333-4333-8333-333333333333', MIA));
const other = draftItem(draft('44444444-4444-4444-8444-444444444444', JORDAN));

describe('subQueuePositionFor', () => {
  it('numbers a guest cards in deck order', () => {
    const deck = [a, b, c];
    expect(subQueuePositionFor(deck, a)).toEqual({ position: 1, total: 3 });
    expect(subQueuePositionFor(deck, b)).toEqual({ position: 2, total: 3 });
    expect(subQueuePositionFor(deck, c)).toEqual({ position: 3, total: 3 });
  });

  it('counts only that guest, not the whole deck', () => {
    const deck = [a, other, b];
    expect(subQueuePositionFor(deck, a)).toEqual({ position: 1, total: 2 });
    expect(subQueuePositionFor(deck, b)).toEqual({ position: 2, total: 2 });
  });

  /**
   * The hand-off: with one card left the row disappears. Null rather than
   * `{ position: 1, total: 1 }`, so no caller has to remember a `total > 1`
   * check of its own.
   */
  it('says nothing about a guest with only one card', () => {
    expect(subQueuePositionFor([a, other], a)).toBeNull();
    expect(subQueuePositionFor([other], other)).toBeNull();
  });

  /**
   * The renumbering the hand-off asks for. Sending one of Mia's three leaves
   * "1 / 2" and "2 / 2" — which works because the count comes from the DECK,
   * which reflects optimistic removals, rather than from the server's
   * `otherPendingDraftsForGuest`, which would still say three until a reload.
   */
  it('renumbers the rest when one of the guest cards is sent', () => {
    const afterSend = [b, c];
    expect(subQueuePositionFor(afterSend, b)).toEqual({ position: 1, total: 2 });
    expect(subQueuePositionFor(afterSend, c)).toEqual({ position: 2, total: 2 });
  });

  it('drops the row entirely once only one is left', () => {
    expect(subQueuePositionFor([c], c)).toBeNull();
  });

  /**
   * A commitment is not a pending reply. Counting one would give the operator a
   * number they cannot reconcile with the cards they can act on.
   */
  it('never counts a heads-up card, even for the same guest', () => {
    const deck = [a, headsUpItem(commitment('55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c', MIA))];
    expect(subQueuePositionFor(deck, a)).toBeNull();
  });

  it('says nothing about a heads-up card itself', () => {
    const headsUp = headsUpItem(
      commitment('55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c', MIA),
    );
    expect(subQueuePositionFor([headsUp, a, b], headsUp)).toBeNull();
  });
});

describe('subQueueLabel', () => {
  it('reads the way the hand-off writes it', () => {
    expect(subQueueLabel({ position: 1, total: 3 }, 'Mia')).toBe(
      '1 / 3 cards for Mia',
    );
  });

  // TAC-402: "Marker copy must read true for any count."
  it('reads true at two, not only at three', () => {
    expect(subQueueLabel({ position: 2, total: 2 }, 'Mia')).toBe(
      '2 / 2 cards for Mia',
    );
  });

  it('uses a handle when the guest has no name', () => {
    expect(subQueueLabel({ position: 1, total: 2 }, '@lena.eats')).toBe(
      '1 / 2 cards for @lena.eats',
    );
  });

  it('carries no em dash', () => {
    expect(subQueueLabel({ position: 1, total: 3 }, 'Mia')).not.toContain('—');
  });
});
