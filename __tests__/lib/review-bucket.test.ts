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
  bucketForDraft,
  bucketForItem,
  formatProgress,
  isReviewBucket,
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
