import { type HeadsUpCommitment, type PendingDraft } from '@/lib/api/queue';
import {
  listCommitmentsFixture,
  listQueueFixture,
  resetQueueFixture,
} from '@/lib/fixtures/queue';
import { CARD_GROUND_NAMES, STRIP_COLORS } from '@/lib/grounds';
import { buildQueueItems, draftItem, headsUpItem } from '@/lib/queue-items';
import {
  FALLBACK_BUCKET,
  SERVER_REASON_CODES,
  UNRULED_SERVER_REASON_CODES,
  bucketForDraft,
  bucketForItem,
  formatProgress,
  hasExplicitBucket,
  isReviewBucket,
  planAlsoLines,
  secondaryTriggerLabels,
  stripColorFor,
  stripLabelForDraft,
} from '@/lib/review-bucket';

function draftWith(overrides: Partial<PendingDraft>): PendingDraft {
  return {
    messageId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    venueSlug: 'mock-venue',
    venueTimezone: null,
    guestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
    guestDisplayName: 'Test Guest',
    guestPhoneFallback: '+15550000000',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
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
    ...overrides,
  };
}

const commitment: HeadsUpCommitment = {
  id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
  venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  guestId: 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
  type: 'comp',
  guest: { name: 'Sam' },
  description: 'A cortado on the house',
  code: '7K2P',
  expected_arrival: null,
  created_at: '2026-09-14T08:00:00.000Z',
  recognitionState: 'regular',
  sourceMessageId: null,
};

/**
 * TAC-364 design spec, "Reason code → bucket". Transcribed from the ticket as a
 * literal: a table read back off the module would agree with any mapping at
 * all, which is how the prose map this replaces passed its own tests while
 * matching no production card.
 */
const SPEC_TABLE: ReadonlyArray<readonly [string, string]> = [
  ['commitment_type_gated', 'obligation'],
  ['comp_regex_backstop', 'obligation'],
  ['complaint_commitment_floor', 'obligation'],
  ['mechanic_offer_backstop', 'obligation'],
  ['knowledge_gap', 'outsideDraft'],
  ['knowledge_gap_backstop', 'outsideDraft'],
  ['grounding_check_failed', 'outsideDraft'],
  ['hold_all_outbound', 'outsideDraft'],
  ['category_requires_approval', 'outsideDraft'],
  ['model_flagged', 'draftWrong'],
  ['self_talk_detected', 'draftWrong'],
  ['fidelity_below_auto_send_floor', 'draftWrong'],
  ['generation_failed', 'draftWrong'],
  ['previous_pending_held', 'midThread'],
  ['operator_decline_initiated', 'midThread'],
];

describe('bucketForDraft — the spec table', () => {
  it.each(SPEC_TABLE)('puts %s in %s', (code, bucket) => {
    expect(bucketForDraft(draftWith({ reviewReasonCode: code }))).toBe(bucket);
  });
});

describe('bucketForDraft — keyed on the code, never the label', () => {
  it('ignores a real label when the code is unknown', () => {
    expect(
      bucketForDraft(
        draftWith({
          reviewReason: 'This offers something free. Your call.',
          reviewReasonCode: 'a_code_this_app_does_not_know',
        }),
      ),
    ).toBe('midThread');
  });

  it('gives the retired prose reasons no colour of their own', () => {
    for (const prose of ['low fidelity score', 'first message from new guest', 'no draft generated']) {
      expect(bucketForDraft(draftWith({ reviewReason: prose }))).toBe('midThread');
    }
  });

  it('puts a row with no code recorded on mid-thread', () => {
    expect(bucketForDraft(draftWith({ reviewReasonCode: '' }))).toBe('midThread');
  });

  it('does not find a bucket on the object prototype', () => {
    for (const code of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(bucketForDraft(draftWith({ reviewReasonCode: code }))).toBe('midThread');
    }
  });

  it('tolerates whitespace around the code', () => {
    expect(bucketForDraft(draftWith({ reviewReasonCode: ' knowledge_gap ' }))).toBe(
      'outsideDraft',
    );
  });

  // Unrecognised is not a flag. The spec is explicit that an unknown code
  // falls back to mid-thread, never to a colour that claims something happened.
  it('falls back to mid-thread, never to a flag colour', () => {
    expect(FALLBACK_BUCKET).toBe('midThread');
  });
});

describe('bucketForItem', () => {
  it('puts every heads-up card on its own ground', () => {
    expect(bucketForItem(headsUpItem(commitment))).toBe('headsUp');
  });

  it('reads a draft card by its code', () => {
    expect(
      bucketForItem(draftItem(draftWith({ reviewReasonCode: 'self_talk_detected' }))),
    ).toBe('draftWrong');
  });
});

describe('stripLabelForDraft', () => {
  it.each([
    ['commitment_type_gated', 'Obligation'],
    ['hold_all_outbound', 'Outside the draft'],
    ['category_requires_approval', 'Outside the draft'],
    ['generation_failed', 'Draft came out wrong'],
    ['previous_pending_held', 'Mid-thread'],
  ])('labels %s "%s"', (code, label) => {
    expect(stripLabelForDraft(draftWith({ reviewReasonCode: code }))).toBe(label);
  });

  // Honey is the fallback ground, but "Mid-thread" is a claim about the card.
  it('reads "Needs review", never a bucket name, for a code it does not know', () => {
    expect(stripLabelForDraft(draftWith({ reviewReasonCode: 'something_new' }))).toBe(
      'Needs review',
    );
    expect(stripLabelForDraft(draftWith({ reviewReasonCode: '' }))).toBe('Needs review');
  });

  it('never says "Flagged"', () => {
    for (const [code] of SPEC_TABLE) {
      expect(stripLabelForDraft(draftWith({ reviewReasonCode: code }))).not.toMatch(/flagged/i);
    }
  });
});

describe('stripColorFor', () => {
  it('reads every bucket strip from lib/grounds.ts', () => {
    for (const name of CARD_GROUND_NAMES) {
      expect(stripColorFor(name)).toBe(STRIP_COLORS[name]);
    }
  });
});

describe('isReviewBucket', () => {
  it('accepts the five buckets', () => {
    for (const name of CARD_GROUND_NAMES) {
      expect(isReviewBucket(name)).toBe(true);
    }
  });

  // Route params are untrusted strings; the retired tone and ground names are
  // the ones most likely to arrive from an old link or an old build.
  it('rejects the retired names, the clay roles and anything else', () => {
    for (const value of ['clay', 'stone', 'ink', 'queueClay', 'neutral', 'resting', 'auth', '', undefined, 3]) {
      expect(isReviewBucket(value)).toBe(false);
    }
  });
});

describe('secondaryTriggerLabels', () => {
  const labels = {
    commitment_type_gated: 'This offers something free. Your call.',
    fidelity_below_auto_send_floor: "This doesn't sound enough like you.",
    hold_all_outbound: "You're holding everything here right now.",
  };

  it('lists every trigger but the primary, in server order', () => {
    expect(
      secondaryTriggerLabels(
        draftWith({
          reviewReason: labels.fidelity_below_auto_send_floor,
          reviewReasonCode: 'fidelity_below_auto_send_floor',
          reviewTriggers: ['commitment_type_gated', 'fidelity_below_auto_send_floor', 'hold_all_outbound'],
          reviewTriggerLabels: [
            labels.commitment_type_gated,
            labels.fidelity_below_auto_send_floor,
            labels.hold_all_outbound,
          ],
        }),
      ),
    ).toEqual([labels.commitment_type_gated, labels.hold_all_outbound]);
  });

  it('shows nothing when only the primary fired', () => {
    expect(
      secondaryTriggerLabels(
        draftWith({
          reviewReason: labels.commitment_type_gated,
          reviewReasonCode: 'commitment_type_gated',
          reviewTriggers: ['commitment_type_gated'],
          reviewTriggerLabels: [labels.commitment_type_gated],
        }),
      ),
    ).toEqual([]);
  });

  // The subtraction is by CODE. The sentence dedupe below would hide a missing
  // subtraction whenever the primary's sentence matches its label, so this case
  // has no sentence at all.
  it('subtracts the primary by code, even when no sentence came with it', () => {
    expect(
      secondaryTriggerLabels(
        draftWith({
          reviewReason: null,
          reviewReasonCode: 'commitment_type_gated',
          reviewTriggers: ['commitment_type_gated', 'hold_all_outbound'],
          reviewTriggerLabels: [labels.commitment_type_gated, labels.hold_all_outbound],
        }),
      ),
    ).toEqual([labels.hold_all_outbound]);
  });

  it("drops the server's fallback label, which says nothing as a secondary", () => {
    expect(
      secondaryTriggerLabels(
        draftWith({
          reviewReason: labels.commitment_type_gated,
          reviewReasonCode: 'commitment_type_gated',
          reviewTriggers: ['commitment_type_gated', 'a_code_the_server_has_no_label_for', 'hold_all_outbound'],
          reviewTriggerLabels: [labels.commitment_type_gated, 'Needs review', labels.hold_all_outbound],
        }),
      ),
    ).toEqual([labels.hold_all_outbound]);
  });

  it('matches the primary code whatever whitespace surrounds it', () => {
    expect(
      secondaryTriggerLabels(
        draftWith({
          reviewReason: null,
          reviewReasonCode: ' commitment_type_gated ',
          reviewTriggers: ['commitment_type_gated', 'hold_all_outbound'],
          reviewTriggerLabels: [labels.commitment_type_gated, labels.hold_all_outbound],
        }),
      ),
    ).toEqual([labels.hold_all_outbound]);
  });

  it('shows nothing for a row recorded before the trigger set was', () => {
    expect(
      secondaryTriggerLabels(draftWith({ reviewReasonCode: 'model_flagged' })),
    ).toEqual([]);
  });

  it('shows nothing rather than a mispaired label when the arrays disagree in length', () => {
    expect(
      secondaryTriggerLabels(
        draftWith({
          reviewReasonCode: 'commitment_type_gated',
          reviewTriggers: ['commitment_type_gated', 'hold_all_outbound'],
          reviewTriggerLabels: [labels.commitment_type_gated],
        }),
      ),
    ).toEqual([]);
  });

  it('drops a label that repeats the primary sentence or an earlier label', () => {
    expect(
      secondaryTriggerLabels(
        draftWith({
          reviewReason: 'Needs review',
          reviewReasonCode: 'mystery_one',
          reviewTriggers: ['mystery_one', 'mystery_two', 'hold_all_outbound', 'mystery_three'],
          reviewTriggerLabels: ['Needs review', 'Needs review', labels.hold_all_outbound, labels.hold_all_outbound],
        }),
      ),
    ).toEqual([labels.hold_all_outbound]);
  });
});

describe('formatProgress', () => {
  it('zero-pads both halves to two digits', () => {
    expect(formatProgress(1, 4)).toBe('01 / 04');
  });

  it('does not truncate past two digits', () => {
    expect(formatProgress(10, 120)).toBe('10 / 120');
  });
});

describe('the seeded fixture deck', () => {
  beforeEach(() => {
    resetQueueFixture();
  });

  it('reaches all five grounds offline', () => {
    const items = buildQueueItems(listQueueFixture(), listCommitmentsFixture());
    expect(new Set(items.map(bucketForItem))).toEqual(new Set(CARD_GROUND_NAMES));
  });

  it('carries a secondary trigger and a flagged claim, so the review detail renders offline', () => {
    const drafts = listQueueFixture();
    expect(drafts.some((d) => secondaryTriggerLabels(d).length > 0)).toBe(true);
    expect(drafts.some((d) => d.ungroundedClaims.length > 0)).toBe(true);
  });
});

/**
 * Which secondary reasons fit a surface, and how many are held back. (TAC-388.)
 *
 * A reason cut off mid-sentence is worse than one withheld: an operator reading
 * half of it completes it themselves. So a reason that needs more lines than the
 * surface gives it is withheld and counted, and so is anything past the item cap.
 */
describe('planAlsoLines', () => {
  const A = 'First reason.';
  const B = 'Second reason.';
  const C = 'Third reason.';
  const D = 'Fourth reason.';
  const card = { maxItems: 3, maxLinesPerItem: 2 };
  const takeover = { maxItems: 2, maxLinesPerItem: 1 };

  it('has nothing to plan with no labels', () => {
    expect(planAlsoLines({ labels: [], lineCounts: [], ...card })).toEqual({ shown: [], hidden: 0 });
  });

  it('waits until every label has been measured', () => {
    expect(planAlsoLines({ labels: [A, B], lineCounts: [1, null], ...card })).toBeNull();
  });

  it('refuses measurements that do not pair with the labels', () => {
    expect(planAlsoLines({ labels: [A, B], lineCounts: [1], ...card })).toBeNull();
  });

  it('shows every reason, in server order, when all of them fit', () => {
    expect(planAlsoLines({ labels: [A, B, C], lineCounts: [2, 1, 1], ...card })).toEqual({
      shown: [A, B, C],
      hidden: 0,
    });
  });

  it('fits a reason that needs exactly the lines it has', () => {
    expect(planAlsoLines({ labels: [A], lineCounts: [2], ...card })).toEqual({
      shown: [A],
      hidden: 0,
    });
  });

  it('past the item cap, keeps a line for the count', () => {
    expect(planAlsoLines({ labels: [A, B, C], lineCounts: [1, 1, 1], ...takeover })).toEqual({
      shown: [A],
      hidden: 2,
    });
    expect(planAlsoLines({ labels: [A, B, C, D], lineCounts: [1, 1, 1, 1], ...card })).toEqual({
      shown: [A, B],
      hidden: 2,
    });
  });

  it('withholds a reason too long for its lines rather than cutting it', () => {
    expect(planAlsoLines({ labels: [A, B], lineCounts: [2, 1], ...takeover })).toEqual({
      shown: [B],
      hidden: 1,
    });
  });

  it('withholds by length and by count at once', () => {
    expect(planAlsoLines({ labels: [A, B, C, D], lineCounts: [3, 1, 2, 1], ...card })).toEqual({
      shown: [B, C],
      hidden: 2,
    });
  });

  it('counts everything when nothing fits', () => {
    expect(planAlsoLines({ labels: [A, B], lineCounts: [2, 2], ...takeover })).toEqual({
      shown: [],
      hidden: 2,
    });
  });
});

/**
 * Every reason code the server can emit has an EXPLICIT bucket (TAC-511).
 *
 * The defect this exists for: five codes shipped in `analog-guest` and every
 * one of their cards rendered as an ordinary mid-thread draft, silently, for a
 * release. `FALLBACK_BUCKET` is the right behaviour for a code we have never
 * heard of, but it is the wrong behaviour for one we have, and nothing told
 * anyone the difference.
 *
 * **What this can and cannot catch.** `SERVER_REASON_CODES` is a hand-kept
 * mirror, like `BUCKET_BY_CODE`, so it catches a code we know about and forgot
 * to map. It cannot catch a code the server added and we never heard about:
 * nothing in this repo can reach that enum. Stating the limit rather than
 * letting a green run imply a guarantee it does not give.
 */
describe('every server reason code is mapped', () => {
  it.each(SERVER_REASON_CODES)('%s has an explicit bucket', (code) => {
    expect(hasExplicitBucket(code)).toBe(true);
  });

  it('does not silently drop to the mid-thread fallback', () => {
    const unmapped = SERVER_REASON_CODES.filter((code) => !hasExplicitBucket(code));
    expect(unmapped).toEqual([]);
  });

  /**
   * The ruling of 2026-09-23, transcribed. Its two bucket names are plainer
   * English for the two that exist in the code: "commitment" is `obligation`,
   * "knowledge confirmation" is `outsideDraft`.
   */
  it.each([
    ['unverified_url', 'outsideDraft'],
    ['prose_promise_check_failed', 'outsideDraft'],
    ['prose_cancellation_backstop', 'outsideDraft'],
    ['prose_promise_backstop', 'obligation'],
    ['commitment_cancellation_gated', 'obligation'],
  ] as const)('%s lands on %s', (reviewReasonCode, bucket) => {
    expect(bucketForDraft({ reviewReasonCode })).toBe(bucket);
  });

  /**
   * The pairing worth understanding rather than copying. A real cancellation
   * means approving the card does something; a CLAIMED one means the text says
   * something we cannot back up and approving it changes nothing. Different
   * decisions, so different buckets, even though they read as neighbours.
   */
  it('separates a real cancellation from a claimed one', () => {
    expect(bucketForDraft({ reviewReasonCode: 'commitment_cancellation_gated' })).toBe(
      'obligation',
    );
    expect(bucketForDraft({ reviewReasonCode: 'prose_cancellation_backstop' })).toBe(
      'outsideDraft',
    );
  });

  /**
   * The six the server can emit that nobody has ruled a bucket for. They are
   * asserted as unmapped so the gap is a fact in the suite rather than a
   * sentence in a comment, and so that moving one across flips a test in both
   * directions at once.
   */
  it.each(UNRULED_SERVER_REASON_CODES)(
    '%s is knowingly unmapped, pending a ruling',
    (code) => {
      expect(hasExplicitBucket(code)).toBe(false);
      expect(bucketForDraft({ reviewReasonCode: code })).toBe(FALLBACK_BUCKET);
    },
  );

  it('keeps the two lists disjoint, so a code cannot be in both', () => {
    const overlap = SERVER_REASON_CODES.filter((code) =>
      UNRULED_SERVER_REASON_CODES.includes(code),
    );
    expect(overlap).toEqual([]);
  });

  it('still sends a code it has never seen to the fallback, not to a flag colour', () => {
    expect(bucketForDraft({ reviewReasonCode: 'something_invented_later' })).toBe(
      FALLBACK_BUCKET,
    );
    expect(hasExplicitBucket('something_invented_later')).toBe(false);
  });
});
