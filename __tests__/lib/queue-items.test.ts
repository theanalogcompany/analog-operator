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
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    replyingTo: null,
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
      swipeActionFor(card, outcome, { expired: false }).type,
    );
  });

  it('acknowledges on swipe-right', () => {
    expect(swipeActionFor(card, 'right', { expired: false })).toEqual({ type: 'acknowledge', commitment });
  });

  it('declines on swipe-left', () => {
    expect(swipeActionFor(card, 'left', { expired: false })).toEqual({ type: 'decline', commitment });
  });

  it('does nothing on a refusal, which the gesture never produces for this card', () => {
    // Refusing is how a draft card says "nothing to send". A heads-up card has
    // nothing to send by design, so a refusal arriving anyway must be inert.
    expect(swipeActionFor(card, 'refuse-right', { expired: false })).toEqual({ type: 'none' });
  });

  it('does nothing on a short drag', () => {
    expect(swipeActionFor(card, 'return', { expired: false })).toEqual({ type: 'none' });
  });
});

describe('swipeActionFor — a draft card routes as it always has', () => {
  const draft = makeDraft();
  const card = draftItem(draft);

  it('approves on swipe-right', () => {
    expect(swipeActionFor(card, 'right', { expired: false })).toEqual({ type: 'approve', draft });
  });

  it('opens the editor on swipe-left', () => {
    expect(swipeActionFor(card, 'left', { expired: false })).toEqual({ type: 'edit', draft });
  });

  it('explains a refused swipe-right', () => {
    expect(swipeActionFor(card, 'refuse-right', { expired: false })).toEqual({ type: 'refuse-approve', draft });
  });

  it('does nothing on a short drag', () => {
    expect(swipeActionFor(card, 'return', { expired: false })).toEqual({ type: 'none' });
  });

  it.each(ALL_OUTCOMES)('%s never acknowledges or declines a commitment', (outcome) => {
    expect(['acknowledge', 'decline']).not.toContain(swipeActionFor(card, outcome, { expired: false }).type);
  });
});

describe('canCommitRightFor', () => {
  it('always lets a heads-up card be acknowledged, however bare', () => {
    expect(
      canCommitRightFor(headsUpItem(makeCommitment({ description: '', code: null })), {
        expired: false,
      }),
    ).toBe(true);
  });

  it('lets a draft with a body be sent', () => {
    expect(canCommitRightFor(draftItem(makeDraft()), { expired: false })).toBe(true);
  });

  it.each(['', '   \n '])('refuses a draft whose body is %j', (draftBody) => {
    expect(
      canCommitRightFor(draftItem(makeDraft({ draftBody })), { expired: false }),
    ).toBe(false);
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

// Since TAC-394 a guest can hold two pending drafts, so a draft push has to be
// matched on the draft it names, not on the guest. Neither of Sam's cards starts
// on top, so a matcher that matches nothing can't pass. (TAC-403.)
describe('surfaceTappedItem — a draft push names one of the guest’s two drafts', () => {
  const OTHER_ID = '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e';
  const SAM_A_ID = '33c6f1e3-4b5a-4c7d-8e9f-9a0b1c2d3e4f';
  const SAM_B_ID = '44d7a2f4-5c6b-4d8e-9fa0-ab1c2d3e4f5a';
  const items = buildQueueItems(
    [
      makeDraft({ messageId: OTHER_ID }),
      makeDraft({ messageId: SAM_A_ID, guestId: SAM }),
      makeDraft({ messageId: SAM_B_ID, guestId: SAM }),
    ],
    [],
  );
  const deckAfter = (target: Parameters<typeof surfaceTappedItem>[1]) =>
    surfaceTappedItem(items, target).map((item) => item.key);

  it('lifts the second draft when the push names it', () => {
    expect(deckAfter({ kind: 'draft', guestId: SAM, draftId: SAM_B_ID })).toEqual([
      SAM_B_ID,
      OTHER_ID,
      SAM_A_ID,
    ]);
  });

  it('lifts the first draft when the push names that one', () => {
    expect(deckAfter({ kind: 'draft', guestId: SAM, draftId: SAM_A_ID })).toEqual([
      SAM_A_ID,
      OTHER_ID,
      SAM_B_ID,
    ]);
  });

  it('falls back to the guest’s first card only when the push carries no draftId', () => {
    expect(deckAfter({ kind: 'draft', guestId: SAM })).toEqual([
      SAM_A_ID,
      OTHER_ID,
      SAM_B_ID,
    ]);
  });

  it('keeps the natural order when the named draft is not in the queue, rather than lifting the guest’s other card', () => {
    expect(
      deckAfter({
        kind: 'draft',
        guestId: SAM,
        draftId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      }),
    ).toEqual([OTHER_ID, SAM_A_ID, SAM_B_ID]);
  });
});

/**
 * The expired guard, over every outcome the gesture can produce (TAC-486).
 *
 * Exhaustive on purpose. TAC-312's lesson is that the swipe decision is the one
 * place this behaviour lives, so a guard that covered "right" and left "left"
 * open would hand an expired card a working edit, and the composer it opened
 * would end in a send that cannot happen.
 */
describe('swipeActionFor on an expired card', () => {
  const expiredDraft = draftItem(makeDraft({ draftBody: 'still a good draft' }));

  it.each(['right', 'left', 'refuse-right'] as const)(
    'refuses %s and asks for the explanation instead',
    (outcome) => {
      expect(swipeActionFor(expiredDraft, outcome, { expired: true })).toEqual({
        type: 'blocked-expired',
      });
    },
  );

  it('owes nothing for a short drag that committed to nothing', () => {
    expect(swipeActionFor(expiredDraft, 'return', { expired: true })).toEqual({
      type: 'none',
    });
  });

  it('can never reach approve or edit, whatever the outcome', () => {
    const reachable = (['right', 'left', 'refuse-right', 'return'] as const).map(
      (outcome) => swipeActionFor(expiredDraft, outcome, { expired: true }).type,
    );
    expect(reachable).not.toContain('approve');
    expect(reachable).not.toContain('edit');
    expect(reachable).not.toContain('refuse-approve');
  });

  it('still behaves normally when the window is open', () => {
    expect(swipeActionFor(expiredDraft, 'right', { expired: false }).type).toBe(
      'approve',
    );
    expect(swipeActionFor(expiredDraft, 'left', { expired: false }).type).toBe('edit');
  });

  /**
   * A heads-up card has no reply window of its own — TAC-473's Contract gives
   * commitments none of the three fields — so the expired flag is never true
   * for one, and the heads-up branch is checked first regardless.
   */
  it('leaves a heads-up card alone even if the flag is somehow set', () => {
    const headsUp = headsUpItem(makeCommitment());
    expect(swipeActionFor(headsUp, 'right', { expired: true }).type).toBe(
      'acknowledge',
    );
    expect(swipeActionFor(headsUp, 'left', { expired: true }).type).toBe('decline');
  });
});

describe('canCommitRightFor on an expired card', () => {
  it('refuses a right-swipe even on a card with a perfectly good draft', () => {
    // Nothing can be sent from analog once the window has shut, so the reason
    // it refuses is the window, not the body.
    expect(
      canCommitRightFor(draftItem(makeDraft({ draftBody: 'a good draft' })), {
        expired: true,
      }),
    ).toBe(false);
  });

  it('still allows it while the window is open', () => {
    expect(
      canCommitRightFor(draftItem(makeDraft({ draftBody: 'a good draft' })), {
        expired: false,
      }),
    ).toBe(true);
  });
});
