import { type PendingDraft } from '@/lib/api/queue';
import { listQueueFixture } from '@/lib/fixtures/queue';
import {
  formatProgress,
  groundForTone,
  reasonLabelFor,
  stripColorFor,
  toneFor,
} from '@/lib/queue-tone';

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
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 0,
    recentContext: [],
    langfuseTraceId: null,
    ...overrides,
  } as PendingDraft;
}

// The design's table, transcribed. Each seeded card carries a tone that picks
// both the flag-strip color and the screen's ground:
//
//   Reservation                            -> clay  #A85638  has draft
//   Flagged — first message from new guest -> stone #3A3530  has draft
//   Flagged — low fidelity score           -> clay  #A85638  has draft
//   Flagged — no draft generated           -> ink   #1C1814  NO draft
describe('toneFor — the design’s four flag states', () => {
  it('maps a low-fidelity flag to clay', () => {
    expect(toneFor(draftWith({ reviewReason: 'low fidelity score' }))).toBe('clay');
  });

  it('maps a new-guest flag to stone', () => {
    expect(
      toneFor(draftWith({ reviewReason: 'first message from new guest' })),
    ).toBe('stone');
  });

  it('maps a missing draft to ink', () => {
    expect(toneFor(draftWith({ reviewReason: 'no draft generated' }))).toBe('ink');
  });

  it('maps an unflagged reservation to clay via its category', () => {
    expect(
      toneFor(draftWith({ reviewReason: null, category: 'reservation' })),
    ).toBe('clay');
  });
});

describe('toneFor — inputs the design did not enumerate', () => {
  it('falls back to stone for a reason it does not recognize', () => {
    // The map is keyed on English prose from another repo, so an unrecognized
    // reason is a question of when, not if. Failing safe to the neutral tone
    // beats throwing on a card the operator still needs to answer.
    expect(toneFor(draftWith({ reviewReason: 'something entirely new' }))).toBe(
      'stone',
    );
  });

  it('falls back to stone with neither a reason nor a category', () => {
    expect(toneFor(draftWith({}))).toBe('stone');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(toneFor(draftWith({ reviewReason: '  No Draft Generated ' }))).toBe(
      'ink',
    );
  });

  it('treats an empty-string reason as absent, not as unrecognized', () => {
    expect(toneFor(draftWith({ reviewReason: '   ', category: 'reservation' }))).toBe(
      'clay',
    );
  });
});

describe('reasonLabelFor', () => {
  it('prefixes a review reason with "Flagged — "', () => {
    expect(reasonLabelFor(draftWith({ reviewReason: 'low fidelity score' }))).toBe(
      'Flagged — low fidelity score',
    );
  });

  it('does not double-prefix a reason the server already flagged', () => {
    expect(
      reasonLabelFor(draftWith({ reviewReason: 'Flagged — low fidelity score' })),
    ).toBe('Flagged — low fidelity score');
  });

  it('title-cases the category when there is no reason', () => {
    expect(
      reasonLabelFor(draftWith({ reviewReason: null, category: 'reservation' })),
    ).toBe('Reservation');
  });

  it('falls back to a neutral label with neither', () => {
    expect(reasonLabelFor(draftWith({}))).toBe('Needs review');
  });
});

describe('stripColorFor / groundForTone', () => {
  it('uses clay-deep for the clay strip, not the clay token', () => {
    // #C66A4A is `clay`; the strip is `clay-deep`. Getting this wrong is
    // invisible in a screenshot and wrong in the design.
    expect(stripColorFor('clay')).toBe('#A85638');
    expect(stripColorFor('stone')).toBe('#3A3530');
    expect(stripColorFor('ink')).toBe('#1C1814');
  });

  it('routes each tone to its own ground', () => {
    expect(groundForTone('clay')).toBe('queueClay');
    expect(groundForTone('stone')).toBe('queueStone');
    expect(groundForTone('ink')).toBe('queueInk');
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
  // The fixtures are the data source for this screen, so the mapping is only
  // real if it holds over them. This also guards the join: these reason
  // strings live in lib/fixtures/queue.ts, the map lives in lib/queue-tone.ts,
  // and nothing but this test connects them.
  const deck = listQueueFixture();

  it('gives every seeded card a tone', () => {
    for (const draft of deck) {
      expect(['clay', 'stone', 'ink']).toContain(toneFor(draft));
    }
  });

  it('reaches all three tones, so every ground is exercised offline', () => {
    const tones = new Set(deck.map(toneFor));
    expect(tones).toEqual(new Set(['clay', 'stone', 'ink']));
  });

  it('puts the blank-draft card on ink', () => {
    const blank = deck.find((d) => d.draftBody.trim().length === 0);
    expect(blank).toBeDefined();
    expect(toneFor(blank!)).toBe('ink');
    expect(reasonLabelFor(blank!)).toBe('Flagged — no draft generated');
  });
});
