import { type SwipeOutcome } from '@/hooks/use-queue-swipe';
import { type HeadsUpCommitment, type PendingDraft } from '@/lib/api/queue';
import {
  buildQueueItems,
  canCommitRightFor,
  draftItem,
  headsUpItem,
  headsUpItemKey,
  surfaceTappedItem,
  swipeActionFor,
} from '@/lib/queue-items';

// The no-send guard, as a decision. (TAC-364.)
//
// A heads-up card rides the draft card's swipe chassis, so a heads-up swipe
// routed like a draft swipe would reach `approveDraft` and send a real message
// to a guest. `swipeActionFor` is where that routing is decided, so the guard
// is asserted here over EVERY outcome the gesture can produce, not just the one
// that obviously matters. The wiring from the gesture to this function is
// asserted separately in __tests__/components/queue/queue-card-stack-routing.

const VENUE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SAM = 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c';

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: VENUE,
    venueSlug: 'mock-sextant-coffee-roasters',
    venueTimezone: null,
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    draftBody: "Patio's open until 9.",
    category: null,
    voiceFidelity: 0.81,
    reviewReason: null,
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    ...overrides,
  };
}

function makeCommitment(overrides: Partial<HeadsUpCommitment> = {}): HeadsUpCommitment {
  return {
    id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    venueId: VENUE,
    guestId: SAM,
    type: 'comp',
    guest: { name: 'Sam' },
    description: 'A cortado on the house',
    code: '7K2P',
    expected_arrival: null,
    created_at: '2026-09-14T08:00:00.000Z',
    recognitionState: 'regular',
    sourceMessageId: null,
    ...overrides,
  };
}

const ALL_OUTCOMES: SwipeOutcome[] = ['right', 'left', 'refuse-right', 'return'];

describe('swipeActionFor — a heads-up card never reaches the send path', () => {
  const commitment = makeCommitment();
  const card = headsUpItem(commitment);

  it.each(ALL_OUTCOMES)('%s never approves, edits or refuses a draft', (outcome) => {
    expect(['approve', 'edit', 'refuse-approve']).not.toContain(
      swipeActionFor(card, outcome).type,
    );
  });

  it('acknowledges on swipe-right', () => {
    expect(swipeActionFor(card, 'right')).toEqual({ type: 'acknowledge', commitment });
  });

  it('declines on swipe-left', () => {
    expect(swipeActionFor(card, 'left')).toEqual({ type: 'decline', commitment });
  });

  it('does nothing on a refusal, which the gesture never produces for this card', () => {
    // Refusing is how a draft card says "nothing to send". A heads-up card has
    // nothing to send by design, so a refusal arriving anyway must be inert.
    expect(swipeActionFor(card, 'refuse-right')).toEqual({ type: 'none' });
  });

  it('does nothing on a short drag', () => {
    expect(swipeActionFor(card, 'return')).toEqual({ type: 'none' });
  });
});

describe('swipeActionFor — a draft card routes as it always has', () => {
  const draft = makeDraft();
  const card = draftItem(draft);

  it('approves on swipe-right', () => {
    expect(swipeActionFor(card, 'right')).toEqual({ type: 'approve', draft });
  });

  it('opens the editor on swipe-left', () => {
    expect(swipeActionFor(card, 'left')).toEqual({ type: 'edit', draft });
  });

  it('explains a refused swipe-right', () => {
    expect(swipeActionFor(card, 'refuse-right')).toEqual({ type: 'refuse-approve', draft });
  });

  it('does nothing on a short drag', () => {
    expect(swipeActionFor(card, 'return')).toEqual({ type: 'none' });
  });

  it.each(ALL_OUTCOMES)('%s never acknowledges or declines a commitment', (outcome) => {
    expect(['acknowledge', 'decline']).not.toContain(swipeActionFor(card, outcome).type);
  });
});

describe('canCommitRightFor', () => {
  it('always lets a heads-up card be acknowledged, however bare', () => {
    expect(
      canCommitRightFor(headsUpItem(makeCommitment({ description: '', code: null }))),
    ).toBe(true);
  });

  it('lets a draft with a body be sent', () => {
    expect(canCommitRightFor(draftItem(makeDraft()))).toBe(true);
  });

  it.each(['', '   \n '])('refuses a draft whose body is %j', (draftBody) => {
    expect(canCommitRightFor(draftItem(makeDraft({ draftBody })))).toBe(false);
  });
});

describe('buildQueueItems', () => {
  it('puts heads-up cards first, then drafts, each in the order given', () => {
    const c1 = makeCommitment();
    const c2 = makeCommitment({ id: '77a0d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e' });
    const d1 = makeDraft();
    const d2 = makeDraft({ messageId: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e' });
    expect(buildQueueItems([d1, d2], [c1, c2]).map((item) => item.key)).toEqual([
      headsUpItemKey(c1.id),
      headsUpItemKey(c2.id),
      d1.messageId,
      d2.messageId,
    ]);
  });

  it('keeps a draft keyed on its bare messageId, so progress and undo still line up', () => {
    const draft = makeDraft();
    expect(draftItem(draft).key).toBe(draft.messageId);
  });

  it('never lets a commitment key collide with a draft key, even on the same uuid', () => {
    const shared = '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c';
    const keys = buildQueueItems(
      [makeDraft({ messageId: shared })],
      [makeCommitment({ id: shared })],
    ).map((item) => item.key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('surfaceTappedItem', () => {
  const first = makeCommitment({
    id: '77a0d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e',
    guestId: 'ff77d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e',
  });
  const samsCommitment = makeCommitment();
  const samsDraft = makeDraft({ guestId: SAM });
  const otherDraft = makeDraft({ messageId: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e' });
  const items = buildQueueItems([otherDraft, samsDraft], [first, samsCommitment]);

  it('lifts the exact commitment an arrival push names', () => {
    const surfaced = surfaceTappedItem(items, {
      kind: 'commitment',
      guestId: SAM,
      commitmentId: samsCommitment.id,
    });
    expect(surfaced[0]).toEqual(headsUpItem(samsCommitment));
    expect(surfaced).toHaveLength(items.length);
  });

  it('lifts the guest’s draft for a draft push, not their heads-up card', () => {
    // Sam has both kinds of card. A draft push must not land on the commitment,
    // and a commitment push must not land on the draft: that confusion is what
    // the discriminated tap payload exists to rule out.
    const surfaced = surfaceTappedItem(items, { kind: 'draft', guestId: SAM });
    expect(surfaced[0]).toEqual(draftItem(samsDraft));
  });

  it('keeps the natural order when the tapped card is not in the queue', () => {
    const surfaced = surfaceTappedItem(items, {
      kind: 'commitment',
      guestId: SAM,
      commitmentId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
    });
    expect(surfaced).toEqual(items);
  });

  it('keeps the natural order without a tap', () => {
    expect(surfaceTappedItem(items, null)).toEqual(items);
  });
});
