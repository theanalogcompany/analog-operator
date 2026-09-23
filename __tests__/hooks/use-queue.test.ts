// `applyEvent` was deleted during the TAC-270 schema alignment — the live
// realtime channel emits only `queue_changed`, and `useQueue` responds by
// calling `reload()` (the raw `messages` payload doesn't carry the JOINed
// PendingDraft fields, so per-event merging is infeasible). The hook's
// reload-on-event behavior is exercised end-to-end through the queue screen
// tests; nothing meaningful left to unit-test here.

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useQueue } from '@/hooks/use-queue';
import { type HeadsUpCommitment, type PendingDraft, listQueue } from '@/lib/api/queue';

// The realtime subscription (session/token wiring, channel creation) is
// exercised by __tests__/lib/realtime-queue-channel.test.ts and the queue
// screen tests. Stub it here so this file can isolate the `enabled` gating
// behavior below without dragging in Supabase session state.
jest.mock('@/hooks/use-queue-realtime', () => ({
  useQueueRealtime: jest.fn(),
}));

jest.mock('@/lib/api/queue', () => ({
  listQueue: jest.fn(),
}));

const listQueueMock = listQueue as jest.MockedFunction<typeof listQueue>;

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'A',
    guestPhoneFallback: '+15550001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    draftBody: 'x',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 1,
    recentContext: [],
    langfuseTraceId: null,
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    ...overrides,
  };
}

describe('use-queue', () => {
  it('has no hook-level merge tests after the queue_changed collapse', () => {
    expect(true).toBe(true);
  });
});

// Coverage for the `enabled` option added when useQueue's provider moved
// from app/queue/_layout.tsx (unmounted on sign-out, which threw away state
// for free) to lib/queue-context.tsx's QueueProvider (mounted permanently at
// the root). `enabled` gates fetch/reload, and — because the same instance
// now survives sign-out — must also reset state on the true -> false edge so
// one operator's drafts can't leak into the next session on a shared venue
// device. See hooks/use-queue.ts.
describe('use-queue — enabled gating (queue-context lift)', () => {
  beforeEach(() => {
    listQueueMock.mockReset();
    listQueueMock.mockResolvedValue({ ok: true, data: { drafts: [makeDraft()], commitments: [] } });
  });

  it('never calls listQueue while enabled is false', async () => {
    renderHook(() => useQueue({ enabled: false }));

    // Give any stray microtask a chance to run before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listQueueMock).not.toHaveBeenCalled();
  });

  it('resets drafts to [] and status to loading when enabled flips true -> false', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQueue({ enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.drafts).toEqual([makeDraft()]);

    rerender({ enabled: false });

    expect(result.current.drafts).toEqual([]);
    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBeNull();
  });

  it('fires a fetch when enabled flips false -> true', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQueue({ enabled }),
      { initialProps: { enabled: false } },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listQueueMock).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(listQueueMock).toHaveBeenCalledTimes(1);
    expect(result.current.drafts).toEqual([makeDraft()]);
  });

  // Regression test for the race the reviewer's second pass caught: `reload`
  // closes over the `enabled` that was current when the fetch *started*. The
  // mount effect's deps include `reload` (new identity on every `enabled`
  // toggle), so a `true -> false` transition re-runs that effect within the
  // same commit and sets `mounted.current` back to `true` before an
  // already-in-flight `listQueue()` call resolves — defeating the `mounted`
  // guard alone. Without `enabledRef`, the stale fetch's `.then` would
  // clobber the sign-out reset with the outgoing operator's drafts.
  it('drops a stale in-flight fetch that resolves after enabled flips to false', async () => {
    let resolveFetch!: (value: Awaited<ReturnType<typeof listQueue>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof listQueue>>>((resolve) => {
      resolveFetch = resolve;
    });
    listQueueMock.mockReturnValueOnce(pending);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQueue({ enabled }),
      { initialProps: { enabled: true } },
    );

    // The fetch has started — listQueue() was called — but the mocked
    // promise is still unresolved, simulating a slow network response.
    await waitFor(() => expect(listQueueMock).toHaveBeenCalledTimes(1));

    // Sign-out happens while that fetch is still in flight.
    rerender({ enabled: false });
    expect(result.current.drafts).toEqual([]);
    expect(result.current.status).toBe('loading');

    // The stale fetch now resolves with the OUTGOING operator's data.
    await act(async () => {
      resolveFetch({ ok: true, data: { drafts: [makeDraft()], commitments: [] } });
      await pending;
      // Flush the microtask reload()'s continuation runs on after the await.
      await Promise.resolve();
    });

    // Must still reflect the post-sign-out reset, never the stale payload.
    expect(result.current.drafts).toEqual([]);
    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBeNull();
  });
});

describe('use-queue — heads-up commitments (TAC-364)', () => {
  const commitment = (id: string, created_at: string): HeadsUpCommitment => ({
    id,
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    type: 'comp',
    guest: { name: 'Sam' },
    description: 'A cortado on the house',
    code: '7K2P',
    expected_arrival: null,
    created_at,
    recognitionState: null,
    sourceMessageId: null,
  });
  const OLDER = commitment('55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c', '2026-09-14T07:00:00.000Z');
  const NEWER = commitment('77a0d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e', '2026-09-14T09:00:00.000Z');

  beforeEach(() => {
    listQueueMock.mockReset();
    listQueueMock.mockResolvedValue({
      ok: true,
      data: { drafts: [makeDraft()], commitments: [NEWER, OLDER] },
    });
  });

  it('loads commitments with the drafts, oldest promise first', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.commitments.map((c) => c.id)).toEqual([OLDER.id, NEWER.id]);
  });

  it('clears commitments on sign-out, like drafts', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQueue({ enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.commitments).toHaveLength(2);
    rerender({ enabled: false });
    expect(result.current.commitments).toEqual([]);
  });

  it('removes a commitment and restores it to its place, once', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.optimisticallyRemoveCommitment(OLDER.id));
    expect(result.current.commitments.map((c) => c.id)).toEqual([NEWER.id]);
    act(() => result.current.restoreCommitment(OLDER));
    act(() => result.current.restoreCommitment(OLDER));
    expect(result.current.commitments.map((c) => c.id)).toEqual([OLDER.id, NEWER.id]);
  });
});

/**
 * Queue order (TAC-486, ruled 2026-09-23).
 *
 * The rule CHANGED here, and the ticket's own note said it would not, so these
 * assert the new order against the old one explicitly: time left leads, and
 * recognition tier is a tiebreak within equal urgency rather than the primary
 * key.
 */
describe('queue order', () => {
  const NOW = Date.parse('2026-09-23T12:00:00.000Z');
  const at = (minutes: number) =>
    new Date(NOW + minutes * 60_000).toISOString();

  function igDraft(over: Partial<PendingDraft>): PendingDraft {
    return makeDraft({
      guestChannel: 'instagram',
      instagramUsername: 'someone',
      guestPhoneFallback: '',
      ...over,
    });
  }

  async function order(drafts: PendingDraft[]): Promise<string[]> {
    listQueueMock.mockResolvedValue({
      ok: true,
      data: { drafts, commitments: [] },
    });
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    return result.current.drafts.map((d) => d.messageId);
  }

  /**
   * The case the old order got wrong. `sortByPriority` sorted by recognition
   * tier FIRST, so a raving fan with twenty hours sat above a new guest with
   * forty minutes and the queue buried the card about to become unsendable.
   */
  it('puts the soonest deadline first, even for a less important guest', async () => {
    const fan = igDraft({
      messageId: '11111111-1111-4111-8111-111111111111',
      guestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recognitionState: 'raving_fan',
      replyWindowExpiresAt: at(20 * 60),
    });
    const stranger = igDraft({
      messageId: '22222222-2222-4222-8222-222222222222',
      guestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      recognitionState: 'new',
      replyWindowExpiresAt: at(40),
    });
    expect(await order([fan, stranger])).toEqual([
      stranger.messageId,
      fan.messageId,
    ]);
  });

  it('still ranks by recognition tier when the urgency is equal', async () => {
    const shared = at(6 * 60);
    const newcomer = igDraft({
      messageId: '11111111-1111-4111-8111-111111111111',
      guestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recognitionState: 'new',
      replyWindowExpiresAt: shared,
    });
    const regular = igDraft({
      messageId: '22222222-2222-4222-8222-222222222222',
      guestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      recognitionState: 'regular',
      replyWindowExpiresAt: shared,
    });
    expect(await order([newcomer, regular])).toEqual([
      regular.messageId,
      newcomer.messageId,
    ]);
  });

  it('sorts a card with no window after every card that has one', async () => {
    const text = makeDraft({
      messageId: '11111111-1111-4111-8111-111111111111',
      guestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recognitionState: 'raving_fan',
    });
    const instagram = igDraft({
      messageId: '22222222-2222-4222-8222-222222222222',
      guestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      recognitionState: 'new',
      replyWindowExpiresAt: at(20 * 60),
    });
    expect(await order([text, instagram])).toEqual([
      instagram.messageId,
      text.messageId,
    ]);
  });

  it('keeps tier and age deciding among cards that have no window at all', async () => {
    // Nothing about the old behaviour changes for a text-only queue.
    const newcomer = makeDraft({
      messageId: '11111111-1111-4111-8111-111111111111',
      guestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recognitionState: 'new',
      pendingSinceMs: 900_000,
    });
    const regular = makeDraft({
      messageId: '22222222-2222-4222-8222-222222222222',
      guestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      recognitionState: 'regular',
      pendingSinceMs: 60_000,
    });
    expect(await order([newcomer, regular])).toEqual([
      regular.messageId,
      newcomer.messageId,
    ]);
  });

  /**
   * C1 claims a guest's cards "sit together in the deck". This is what makes
   * that true by construction rather than usually: a per-card comparator would
   * let another guest who tied on the deadline land between them.
   */
  it('keeps one guest cards consecutive even when another guest ties', async () => {
    const shared = at(3 * 60);
    const mia1 = igDraft({
      messageId: '11111111-1111-4111-8111-111111111111',
      guestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recognitionState: 'new',
      replyWindowExpiresAt: shared,
      pendingSinceMs: 900_000,
    });
    const mia2 = igDraft({
      messageId: '22222222-2222-4222-8222-222222222222',
      guestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recognitionState: 'new',
      replyWindowExpiresAt: shared,
      pendingSinceMs: 60_000,
    });
    // Same deadline, same tier, and an age BETWEEN Mia's two. A per-card
    // comparator sorts this straight between them and splits the set; only
    // grouping by guest keeps them together.
    const jordan = igDraft({
      messageId: '33333333-3333-4333-8333-333333333333',
      guestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      recognitionState: 'new',
      replyWindowExpiresAt: shared,
      pendingSinceMs: 300_000,
    });
    const ids = await order([mia1, jordan, mia2]);
    const first = ids.indexOf(mia1.messageId);
    const second = ids.indexOf(mia2.messageId);
    expect(Math.abs(first - second)).toBe(1);
    // And oldest first within the guest.
    expect(first).toBeLessThan(second);
  });
});
