import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { type PendingDraft } from '@/lib/api/queue';
import { cardKey, interleaveCards } from '@/lib/queue/cards';

const DRAFT_VENUE = 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';

const makeDraft = (
  messageId: string,
  pendingSinceMs: number,
): PendingDraft => ({
  messageId,
  venueId: DRAFT_VENUE,
  venueSlug: 'mock',
  guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  guestDisplayName: 'A',
  guestPhoneFallback: '+15550001',
  draftBody: 'body',
  category: null,
  voiceFidelity: null,
  reviewReason: null,
  recognitionState: null,
  agentReasoning: null,
  pendingSinceMs,
  recentContext: [],
  langfuseTraceId: null,
});

const makeCommitment = (
  id: string,
  createdAt: string,
  overrides: Partial<HeadsUpCommitment> = {},
): HeadsUpCommitment => ({
  id,
  type: 'comp',
  guestName: 'Maya',
  description: 'd',
  code: 'XX99',
  expectedArrival: null,
  createdAt,
  recognitionState: null,
  sourceMessageId: null,
  ...overrides,
});

describe('interleaveCards — FIFO by elapsed age', () => {
  it('sorts older items first, mixing draft.pendingSinceMs with commitment age', () => {
    const now = new Date('2026-05-30T16:00:00.000Z').getTime();
    const drafts = [
      makeDraft('d-fresh', 60_000), // 1 min old
      makeDraft('d-old', 30 * 60_000), // 30 min old
    ];
    const commitments = [
      // 10 min old (created 10 min before `now`)
      makeCommitment(
        'c-mid',
        new Date(now - 10 * 60_000).toISOString(),
      ),
      // 5 min old
      makeCommitment(
        'c-recent',
        new Date(now - 5 * 60_000).toISOString(),
      ),
    ];
    const cards = interleaveCards(drafts, commitments, now);
    expect(cards.map((c) => (c.type === 'draft_review' ? c.draft.messageId : c.commitment.id))).toEqual([
      'd-old',
      'c-mid',
      'c-recent',
      'd-fresh',
    ]);
  });

  it('returns empty when both inputs are empty', () => {
    expect(interleaveCards([], [])).toEqual([]);
  });

  it('handles drafts-only input (no commitments)', () => {
    const cards = interleaveCards([makeDraft('a', 1)], []);
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('draft_review');
  });

  it('handles commitments-only input (no drafts)', () => {
    const cards = interleaveCards(
      [],
      [makeCommitment('a', new Date().toISOString())],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('heads_up');
  });

  it('tolerates unparseable createdAt (commitment sorts as freshest)', () => {
    const now = new Date('2026-05-30T16:00:00.000Z').getTime();
    const drafts = [makeDraft('d-old', 30 * 60_000)];
    const commitments = [makeCommitment('c-bad', 'not-a-date')];
    const cards = interleaveCards(drafts, commitments, now);
    // ageMs=0 for the unparseable one → sorts last (freshest)
    expect(
      cards.map((c) => (c.type === 'draft_review' ? c.draft.messageId : c.commitment.id)),
    ).toEqual(['d-old', 'c-bad']);
  });
});

describe('cardKey — namespaced React identity', () => {
  it('prefixes draft cards with "draft:"', () => {
    const draft = makeDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', 1);
    expect(cardKey({ type: 'draft_review', draft })).toBe(
      'draft:11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    );
  });

  it('prefixes heads-up cards with "headsup:"', () => {
    const commitment = makeCommitment(
      'aabbccdd-1111-4222-8333-444455556666',
      new Date().toISOString(),
    );
    expect(cardKey({ type: 'heads_up', commitment })).toBe(
      'headsup:aabbccdd-1111-4222-8333-444455556666',
    );
  });
});
