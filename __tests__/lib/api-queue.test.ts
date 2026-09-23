import * as fixtures from '@/lib/fixtures/queue';
import {
  type PendingDraft,
  type QueueSnapshot,
  acknowledgeCommitment,
  approveDraft,
  declineCommitment,
  isCommitmentGone,
  editAndSend,
  getThread,
  listQueue,
  skipDraft,
  undoAction,
} from '@/lib/api/queue';

const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;
const ORIGINAL_API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

afterAll(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_API_BASE;
});

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
  fixtures.resetQueueFixture();
});

describe('lib/api/queue in fixture mode', () => {
  it('listQueue returns the fixture seed', async () => {
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts.length).toBeGreaterThan(0);
      expect(result.data.commitments.length).toBeGreaterThan(0);
    }
  });

  it('approveDraft removes the draft from the fixture queue', async () => {
    const before = (await listQueue()) as { ok: true; data: QueueSnapshot };
    const target = before.data.drafts[0].messageId;
    await approveDraft(target);
    const after = (await listQueue()) as { ok: true; data: QueueSnapshot };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('skipDraft removes the draft', async () => {
    const before = (await listQueue()) as { ok: true; data: QueueSnapshot };
    const target = before.data.drafts[0].messageId;
    await skipDraft(target);
    const after = (await listQueue()) as { ok: true; data: QueueSnapshot };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('editAndSend removes the draft on first call', async () => {
    const before = (await listQueue()) as { ok: true; data: QueueSnapshot };
    const target = before.data.drafts[0].messageId;
    await editAndSend(target, 'my version');
    const after = (await listQueue()) as { ok: true; data: QueueSnapshot };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('undoAction restores a removed draft', async () => {
    const before = (await listQueue()) as { ok: true; data: QueueSnapshot };
    const target = before.data.drafts[0].messageId;
    await approveDraft(target);
    await undoAction(target);
    const after = (await listQueue()) as { ok: true; data: QueueSnapshot };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeDefined();
  });

  it('getThread returns the fixture thread including seed extensions for known messageIds', async () => {
    const before = (await listQueue()) as { ok: true; data: QueueSnapshot };
    const mayaDraft = before.data.drafts.find(
      (d) => d.messageId === '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    );
    expect(mayaDraft).toBeDefined();
    const result = await getThread('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    expect(result.ok).toBe(true);
    if (result.ok && mayaDraft) {
      // Fixture should return more than just `recentContext` — the seed
      // extension prepends older history for the edit-screen demo.
      expect(result.data.length).toBeGreaterThan(mayaDraft.recentContext.length);
      // Returned messages are ASC by createdAt.
      const timestamps = result.data.map((m) => Date.parse(m.createdAt));
      const sorted = [...timestamps].sort((a, b) => a - b);
      expect(timestamps).toEqual(sorted);
    }
  });

  it('getThread returns [] for an unknown messageId (graceful empty)', async () => {
    const result = await getThread('00000000-0000-4000-8000-000000000000');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });

  it('seeded drafts have real-shaped UUIDs for messageId + guestId + venueId', async () => {
    const result = await listQueue();
    if (!result.ok) throw new Error('listQueue should succeed in fixture mode');
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const d of result.data.drafts) {
      expect(uuidRe.test(d.messageId)).toBe(true);
      expect(uuidRe.test(d.guestId)).toBe(true);
      expect(uuidRe.test(d.venueId)).toBe(true);
    }
    // The heads-up seeds too: a fixture id Zod 4 rejects would drop the card
    // in any path that parses it.
    for (const c of result.data.commitments) {
      expect(uuidRe.test(c.id)).toBe(true);
      expect(uuidRe.test(c.guestId)).toBe(true);
      expect(uuidRe.test(c.venueId)).toBe(true);
    }
  });
});

describe('lib/api/queue HTTP shape', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    fetchMock = jest.fn().mockResolvedValue(new Response('', { status: 200 }));
    global.fetch = fetchMock as any;
    jest
      .spyOn(require('@/lib/supabase/client').supabase.auth, 'getSession')
      .mockResolvedValue({ data: { session: { access_token: 't' } as any } } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('approveDraft posts to /api/operator/messages/:id/approve', async () => {
    await approveDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/messages/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/approve',
    );
    expect(init.method).toBe('POST');
  });

  // The request field is `editedBody`, character-exact per the TAC-309
  // Contract. This assertion previously read `{ body: 'my version' }` — it
  // matched the client and locked the defect in: the server never read `body`,
  // so the operator's typed text rode along under a key nobody looked at and
  // every send failed 400 invalid_input. Green tests proved the client was
  // self-consistent, not that it matched the server. (TAC-310.)
  it('editAndSend posts { editedBody } to /api/operator/messages/:id/edit', async () => {
    await editAndSend('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', 'my version');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/messages/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/edit',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ editedBody: 'my version' });
    expect(JSON.parse(init.body).body).toBeUndefined();
  });

  it('editAndSend puts the operator\'s exact typed text in editedBody', async () => {
    // The payload carries what the operator typed — not the draft body, not a
    // trimmed-to-empty placeholder. This is the assertion that would have
    // caught TAC-310 at the API boundary.
    const typed = "Found it — denim jacket's behind the bar, come grab it anytime.";
    await editAndSend('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', typed);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ editedBody: typed });
  });

  it('approveDraft sends no request body (server ships the stored draft)', async () => {
    // Regression guard for the other half of TAC-310: swipe-right must stay
    // bodiless. If someone "unifies" the two entry points by bolting a payload
    // onto /approve, that's a Contract change and belongs in the ticket first.
    await approveDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it('skipDraft posts to /api/operator/messages/:id/skip', async () => {
    await skipDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/messages/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/skip',
    );
  });

  it('undoAction posts to /api/operator/messages/:id/undo', async () => {
    await undoAction('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/messages/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/undo',
    );
  });

  it('listQueue GETs /api/operator/queue and unwraps the { drafts } envelope', async () => {
    const draft: PendingDraft = {
      messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueSlug: 'mock-sextant',
      guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guestDisplayName: 'Maya R.',
      guestPhoneFallback: '+15551110001',
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      replacedDraft: null,
      replyingTo: null,
      draftBody: "yes, patio's open until 9",
      category: 'reservation',
      voiceFidelity: 0.81,
      reviewReason: 'low fidelity',
      recognitionState: 'returning',
      agentReasoning: 'lean into the warmth',
      pendingSinceMs: 240_000,
      recentContext: [
        {
          id: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'is the patio open',
          createdAt: '2026-05-14T16:00:00.000Z',
        },
      ],
      langfuseTraceId: null,
      reviewReasonCode: '',
      reviewTriggers: [],
      reviewTriggerLabels: [],
      ungroundedClaims: [],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [draft] }), { status: 200 }),
    );

    const result = await listQueue();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.test/api/operator/queue');
    expect(init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts).toHaveLength(1);
      expect(result.data.drafts[0].messageId).toBe(draft.messageId);
      expect(result.data.drafts[0].agentReasoning).toBe('lean into the warmth');
    }
  });

  it('listQueue returns PARSE when the server returns a bare array (regression guard)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const result = await listQueue();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });

  // TAC-364 Contract: four draft fields, always present on the wire.
  // `reviewReasonCode` is the RAW primary code. `reviewTriggers` is the full set
  // as RAW codes, primary INCLUDED and never deduped. `reviewTriggerLabels` is
  // parallel to it. `ungroundedClaims` is always an array, `[]` when nothing
  // was flagged, never null.
  const reviewWireDraft = (review: Record<string, unknown>) => ({
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    replyingTo: null,
    draftBody: "yes, patio's open until 9",
    category: null,
    voiceFidelity: 0.55,
    reviewReason: 'This offers something free. Your call.',
    recognitionState: 'returning',
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    ...review,
  });

  const pickReview = (draft: PendingDraft) => ({
    reviewReasonCode: draft.reviewReasonCode,
    reviewTriggers: draft.reviewTriggers,
    reviewTriggerLabels: draft.reviewTriggerLabels,
    ungroundedClaims: draft.ungroundedClaims,
  });

  it('listQueue keeps the four review fields exactly as the Contract sends them', async () => {
    const review = {
      reviewReasonCode: 'commitment_type_gated',
      reviewTriggers: ['commitment_type_gated', 'fidelity_below_auto_send_floor'],
      reviewTriggerLabels: [
        'This offers something free. Your call.',
        "This doesn't sound enough like you.",
      ],
      ungroundedClaims: [],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [reviewWireDraft(review)] }), { status: 200 }),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) expect(pickReview(result.data.drafts[0])).toEqual(review);
  });

  it('listQueue reads a draft without the four fields as nothing recorded, not a parse failure', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [reviewWireDraft({})] }), { status: 200 }),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(pickReview(result.data.drafts[0])).toEqual({
        reviewReasonCode: '',
        reviewTriggers: [],
        reviewTriggerLabels: [],
        ungroundedClaims: [],
      });
    }
  });

  // `drafts` is one array, so a strict parse would let one bad field blank the
  // whole queue.
  it('listQueue degrades a malformed review field to empty instead of failing every draft', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drafts: [
            reviewWireDraft({
              reviewReasonCode: 42,
              reviewTriggers: 'commitment_type_gated',
              reviewTriggerLabels: null,
              ungroundedClaims: null,
            }),
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts).toHaveLength(1);
      expect(pickReview(result.data.drafts[0])).toEqual({
        reviewReasonCode: '',
        reviewTriggers: [],
        reviewTriggerLabels: [],
        ungroundedClaims: [],
      });
    }
  });

  it('listQueue parses cleanly when the server omits agentReasoning (pre-TAC-278 deploy)', async () => {
    // TAC-276 schema is tolerant: agentReasoning is .nullable().optional().default(null).
    // Until sibling TAC-278 ships the server column, the field is absent from
    // every response — parse must succeed and surface null.
    const draftWithoutReasoning = {
      messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueSlug: 'mock-sextant',
      guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guestDisplayName: 'Maya R.',
      guestPhoneFallback: '+15551110001',
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      replacedDraft: null,
      replyingTo: null,
      draftBody: 'reply',
      category: null,
      voiceFidelity: null,
      reviewReason: null,
      recognitionState: 'returning',
      pendingSinceMs: 240_000,
      recentContext: [],
      langfuseTraceId: null,
      reviewReasonCode: '',
      reviewTriggers: [],
      reviewTriggerLabels: [],
      ungroundedClaims: [],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [draftWithoutReasoning] }), {
        status: 200,
      }),
    );

    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts).toHaveLength(1);
      expect(result.data.drafts[0].agentReasoning).toBeNull();
    }
  });

  // TAC-533 Contract. Every payload below is transcribed from the ticket's
  // `## Contract` block, not from PendingDraftSchema — a shape read off the
  // client can only ever confirm the client agrees with itself, which is how
  // TAC-310 certified a field the server never read.
  describe('replyingTo, per the TAC-533 Contract', () => {
    const contractDraft = (replyingTo: unknown) => ({
      messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueSlug: 'mock-sextant',
      guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guestDisplayName: 'Maya R.',
      guestPhoneFallback: '+15551110001',
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      replacedDraft: null,
      ...(replyingTo === undefined ? {} : { replyingTo }),
      draftBody: 'reply',
      category: null,
      voiceFidelity: null,
      reviewReason: null,
      recognitionState: 'returning',
      pendingSinceMs: 240_000,
      recentContext: [],
      langfuseTraceId: null,
      reviewReasonCode: '',
      reviewTriggers: [],
      reviewTriggerLabels: [],
      ungroundedClaims: [],
    });

    const respondWith = (replyingTo: unknown) =>
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ drafts: [contractDraft(replyingTo)] }), {
          status: 200,
        }),
      );

    it('parses the Contract’s object form exactly as sent', async () => {
      respondWith({
        messageId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        body: 'do you have oat milk for any drink?',
        createdAt: '2026-09-23T18:04:11.271Z',
      });

      const result = await listQueue();
      expect(result.ok).toBe(true);
      if (result.ok) {
        // `createdAt` is sent by the server per the Contract and deliberately
        // not parsed: nothing renders it, and under `.catch(null)` a required
        // field nobody reads can only ever cost a quote that was otherwise fine.
        expect(result.data.drafts[0].replyingTo).toEqual({
          messageId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          body: 'do you have oat milk for any drink?',
        });
      }
    });

    it('parses the Contract’s null, which is every proactive card', async () => {
      respondWith(null);

      const result = await listQueue();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.drafts[0].replyingTo).toBeNull();
    });

    it('parses cleanly while the field is absent, which it is until TAC-534 deploys', async () => {
      // The client ships ahead of the server half. An absent field must read as
      // "nothing to quote" and cost nothing else — not a PARSE that would take
      // the whole queue down on every poll.
      respondWith(undefined);

      const result = await listQueue();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.drafts[0].replyingTo).toBeNull();
    });

    it('parses an empty body rather than rejecting it, and leaves the display call to the card', async () => {
      // A media-only inbound is stored with `body: ''` (TAC-411), so an empty
      // one is a real card and not a malformed payload. Withholding the quote
      // is `shouldShowReplyQuote`'s job, because it also covers the fabricated
      // drafts and fixtures that never reach this schema.
      respondWith({
        messageId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        body: '',
        createdAt: '2026-09-23T18:04:11.271Z',
      });

      const result = await listQueue();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.drafts[0].replyingTo).toEqual({
          messageId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          body: '',
        });
      }
    });

    it('degrades a malformed replyingTo to null instead of failing the draft', async () => {
      // Display-only, so an unreadable one costs the quote, never the card.
      respondWith({ messageId: 'not-a-uuid', body: 'x' });

      const result = await listQueue();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.drafts).toHaveLength(1);
        expect(result.data.drafts[0].replyingTo).toBeNull();
      }
    });
  });

  it('listQueue sorts recentContext ascending by createdAt regardless of server order', async () => {
    // The server RPC returns recentContext newest-first (`order by created_at
    // desc`). The Zod transform in PendingDraftSchema flips it once at the
    // parse boundary so both the card and the edit screen iterate oldest-first
    // without re-sorting. (TAC-280.)
    const newestFirstPayload = {
      messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueSlug: 'mock-sextant',
      guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guestDisplayName: 'Maya R.',
      guestPhoneFallback: '+15551110001',
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      replacedDraft: null,
      replyingTo: null,
      draftBody: 'reply',
      category: null,
      voiceFidelity: null,
      reviewReason: null,
      recognitionState: 'returning',
      agentReasoning: null,
      pendingSinceMs: 240_000,
      recentContext: [
        {
          id: 'dd11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'newest',
          createdAt: '2026-05-14T16:10:00.000Z',
        },
        {
          id: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'outbound',
          body: 'middle',
          createdAt: '2026-05-14T16:05:00.000Z',
        },
        {
          id: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
          direction: 'inbound',
          body: 'oldest',
          createdAt: '2026-05-14T16:00:00.000Z',
        },
      ],
      langfuseTraceId: null,
      reviewReasonCode: '',
      reviewTriggers: [],
      reviewTriggerLabels: [],
      ungroundedClaims: [],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [newestFirstPayload] }), {
        status: 200,
      }),
    );

    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const bodies = result.data.drafts[0].recentContext.map((m) => m.body);
      expect(bodies).toEqual(['oldest', 'middle', 'newest']);
    }
  });

  it('getThread GETs /api/operator/messages/:id/thread and unwraps the { messages } envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
              direction: 'inbound',
              body: 'hi',
              createdAt: '2026-05-14T16:00:00.000Z',
            },
            {
              id: 'bb22e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
              direction: 'outbound',
              body: 'hey',
              createdAt: '2026-05-14T16:00:30.000Z',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await getThread('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/messages/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/thread',
    );
    expect(init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].body).toBe('hi');
      expect(result.data[1].direction).toBe('outbound');
    }
  });

  it('getThread returns HTTP error on 404 / 500 (caller treats uniformly)', async () => {
    // 401/403 routes through `authedFetch`'s refresh-and-retry path and
    // surfaces NO_SESSION when refresh fails — that's owned by the
    // authedFetch tests, not getThread's. Here we cover the
    // non-auth-affected statuses; the edit screen treats every error
    // (HTTP / NO_SESSION / NETWORK / PARSE) uniformly as fallback to
    // recentContext.
    for (const status of [404, 500]) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'oops' }), { status }),
      );
      const result = await getThread('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('HTTP');
    }
  });

  it('getThread returns PARSE when the response is malformed (no messages envelope)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 'x' }]), { status: 200 }),
    );
    const result = await getThread('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });

  it('getThread schema is forward-compat (unknown server fields drop silently, no PARSE)', async () => {
    // TAC-277 Out-of-Scope explicitly preserves forward-compat: response
    // schema can be extended later without breaking existing clients. Adding
    // .strict() would regress this. Guards against accidentally tightening
    // the schema in a follow-up.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
              direction: 'inbound',
              body: 'hi',
              createdAt: '2026-05-14T16:00:00.000Z',
              futureField: 'whatever-future-server-adds',
              anotherFuture: { nested: true },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await getThread('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].body).toBe('hi');
    }
  });

  it('listQueue parses cleanly when agentReasoning is explicitly null', async () => {
    const draftWithNullReasoning = {
      messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      venueSlug: 'mock-sextant',
      guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      guestDisplayName: 'Maya R.',
      guestPhoneFallback: '+15551110001',
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      replacedDraft: null,
      replyingTo: null,
      draftBody: 'reply',
      category: null,
      voiceFidelity: null,
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
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [draftWithNullReasoning] }), {
        status: 200,
      }),
    );

    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts[0].agentReasoning).toBeNull();
    }
  });
  // Heads-up cards (TAC-364). Payloads are transcribed from the TAC-364
  // `## Contract` (`{ id, venueId, guestId, type, guest: { name }, description,
  // code, expected_arrival, created_at, recognitionState, sourceMessageId }`),
  // never from the schema in lib/api/queue.ts. (CLAUDE.md, Cross-repo rule 5.)
  const CONTRACT_COMMITMENT = {
    id: '55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestId: 'ee55b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c',
    type: 'comp',
    guest: { name: 'Sam' },
    description: 'A cortado on the house',
    code: '7K2P',
    expected_arrival: null,
    created_at: '2026-09-14T08:00:00.000Z',
    recognitionState: 'regular',
    sourceMessageId: '66f9c4b6-7e8d-4fa0-9c2b-3e4f5a6b7c8d',
  };
  const OTHER_COMMITMENT_ID = '77a0d5c7-8f9e-4ab1-8d3c-4f5a6b7c8d9e';

  it('listQueue keeps the commitments[] the server sends, instead of stripping them', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ drafts: [], commitments: [CONTRACT_COMMITMENT] }),
        { status: 200 },
      ),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.commitments).toEqual([CONTRACT_COMMITMENT]);
  });

  it('listQueue drops a commitment with no venueId rather than render it unscoped, and keeps the rest', async () => {
    const { venueId: _unused, ...unscoped } = CONTRACT_COMMITMENT;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drafts: [],
          commitments: [unscoped, { ...CONTRACT_COMMITMENT, id: OTHER_COMMITMENT_ID }],
        }),
        { status: 200 },
      ),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.commitments.map((c) => c.id)).toEqual([OTHER_COMMITMENT_ID]);
    }
  });

  it('listQueue keeps a commitment whose display fields are missing, with safe blanks', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          drafts: [],
          commitments: [
            {
              id: CONTRACT_COMMITMENT.id,
              venueId: CONTRACT_COMMITMENT.venueId,
              guestId: CONTRACT_COMMITMENT.guestId,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.commitments).toEqual([
        {
          id: CONTRACT_COMMITMENT.id,
          venueId: CONTRACT_COMMITMENT.venueId,
          guestId: CONTRACT_COMMITMENT.guestId,
          type: '',
          guest: { name: '' },
          description: '',
          code: null,
          expected_arrival: null,
          created_at: null,
          recognitionState: null,
          sourceMessageId: null,
        },
      ]);
    }
  });

  it('listQueue reads a response with no commitments key as no heads-up cards', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [] }), { status: 200 }),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.commitments).toEqual([]);
  });

  it('acknowledgeCommitment posts to /api/operator/commitments/:id/acknowledge with no body', async () => {
    const result = await acknowledgeCommitment(CONTRACT_COMMITMENT.id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/commitments/55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c/acknowledge',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('acknowledgeCommitment surfaces 409 already_acknowledged as a card that is gone', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'already_acknowledged' }), { status: 409 }),
    );
    const result = await acknowledgeCommitment(CONTRACT_COMMITMENT.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isCommitmentGone(result.error)).toBe(true);
  });

  it('declineCommitment posts to /api/operator/commitments/:id/draft-decline with no body and returns { messageId, body }', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messageId: '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f',
          body: "So sorry, we can't do the cortado today after all.",
        }),
        { status: 200 },
      ),
    );
    const result = await declineCommitment(CONTRACT_COMMITMENT.id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/commitments/55e8b3a5-6d7c-4e9f-8b1a-2d3e4f5a6b7c/draft-decline',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(result).toEqual({
      ok: true,
      data: {
        messageId: '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f',
        body: "So sorry, we can't do the cortado today after all.",
      },
    });
  });

  it('declineCommitment accepts the empty body the server degrades to', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ messageId: '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f', body: '' }),
        { status: 200 },
      ),
    );
    const result = await declineCommitment(CONTRACT_COMMITMENT.id);
    expect(result).toEqual({
      ok: true,
      data: { messageId: '88b1e6d8-9a0f-4bc2-8e4d-5a6b7c8d9e0f', body: '' },
    });
  });

  it('declineCommitment returns PARSE when the response carries no messageId', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ body: 'x' }), { status: 200 }),
    );
    const result = await declineCommitment(CONTRACT_COMMITMENT.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });

  it.each([
    [404, 'not_found', true],
    [409, 'invalid_state', true],
    [422, 'refused', false],
    [502, 'internal_error', false],
  ])(
    'declineCommitment surfaces HTTP %i %s, which isCommitmentGone reads as %s',
    async (status, error, gone) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error }), { status }),
      );
      const result = await declineCommitment(CONTRACT_COMMITMENT.id);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({ kind: 'HTTP', status });
        expect(isCommitmentGone(result.error)).toBe(gone);
      }
    },
  );
});

/**
 * TAC-473's and TAC-397's `## Contract` blocks, transcribed.
 *
 * Every expected value below comes from the Contract's own JSON examples, NOT
 * from the client's schema and NOT from a passing run's output. That is
 * CLAUDE.md's "Cross-repo contracts" rule #5, and the reason it exists is
 * TAC-310: a request-shape test written by reading the implementation asserted
 * `{ body }` against a server that read `editedBody`, and CERTIFIED the defect
 * on every green run while five operator sends failed in production.
 *
 * These live in a live-mode block with `fetch` mocked, never in the fixture
 * block: fixture mode short-circuits before `authedFetch`, so nothing there can
 * observe a URL, a header or a payload, and a wire claim made from it would be
 * asserting nothing at all.
 */
describe('lib/api/queue against the TAC-473 and TAC-397 Contracts', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    fetchMock = jest.fn().mockResolvedValue(new Response('', { status: 200 }));
    global.fetch = fetchMock as any;
    jest
      .spyOn(require('@/lib/supabase/client').supabase.auth, 'getSession')
      .mockResolvedValue({ data: { session: { access_token: 't' } as any } } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * The fields TAC-473's example elides as `"…": "…"`. Required by the schema
   * but not named by the Contract, so they are scaffolding, never assertions.
   */
  const ELIDED = {
    category: null,
    voiceFidelity: null,
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    recognitionState: null,
    agentReasoning: null,
    pendingSinceMs: 0,
    recentContext: [],
    langfuseTraceId: null,
  };

  // Transcribed from TAC-473's Contract, "JSON example", first draft.
  const CONTRACT_INSTAGRAM_DRAFT = {
    messageId: '9f3c1d2e-0b7a-4c55-8e21-6a4d9f0e1b33',
    venueId: '1b0f7a44-2c31-4d88-9a10-77c2e5b31f90',
    venueSlug: 'le-mils-coffee',
    guestId: '4e8a2f60-9d14-4b7c-a3e5-2f81c6d40a77',
    guestDisplayName: null,
    guestPhoneFallback: '',
    guestChannel: 'instagram',
    replyWindowExpiresAt: '2026-09-24T09:12:03.000Z',
    instagramUsername: 'hana.brews',
    draftBody: 'We open at 7 tomorrow.',
    reviewReason: 'This commits you to something. Your call.',
    reviewReasonCode: 'commitment_type_gated',
    otherPendingDraftsForGuest: 0,
    replacedDraft: null,
    replyingTo: null,
    ...ELIDED,
  };

  // Transcribed from the same example, second draft (a text guest).
  const CONTRACT_TEXT_DRAFT = {
    ...CONTRACT_INSTAGRAM_DRAFT,
    messageId: '2a77b904-5c6e-41f0-bb2d-1e9c3a85d412',
    guestDisplayName: 'Marcus',
    guestPhoneFallback: '+15551110001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
  };

  function respondWith(drafts: unknown[]): void {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts, commitments: [] }), { status: 200 }),
    );
  }

  it('parses the Contract’s Instagram draft field for field', async () => {
    respondWith([CONTRACT_INSTAGRAM_DRAFT]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [draft] = result.data.drafts;
    expect(draft.guestChannel).toBe('instagram');
    expect(draft.replyWindowExpiresAt).toBe('2026-09-24T09:12:03.000Z');
    expect(draft.instagramUsername).toBe('hana.brews');
    // The handle arrives WITHOUT a leading @; prepending it is the client's job.
    expect(draft.instagramUsername).not.toMatch(/^@/);
    // A phoneless guest is `''`, not null — ruled in TAC-473 so one Instagram
    // guest cannot empty the queue for every operator at that venue.
    expect(draft.guestPhoneFallback).toBe('');
    expect(draft.guestDisplayName).toBeNull();
  });

  it('parses the Contract’s text draft, which carries no window and no handle', async () => {
    respondWith([CONTRACT_TEXT_DRAFT]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [draft] = result.data.drafts;
    expect(draft.guestChannel).toBe('text');
    expect(draft.replyWindowExpiresAt).toBeNull();
    expect(draft.instagramUsername).toBeNull();
  });

  it('parses both drafts from one response, as the example sends them', async () => {
    respondWith([CONTRACT_INSTAGRAM_DRAFT, CONTRACT_TEXT_DRAFT]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.drafts.map((d) => d.guestChannel)).toEqual([
      'instagram',
      'text',
    ]);
  });

  // TAC-473: `replyWindowExpiresAt` null on an INSTAGRAM guest means the window
  // is unknown, not shut. The parse must carry that through untouched so
  // `windowState` can tell the two apart; the client must never coerce it.
  it('keeps a null window on an Instagram draft rather than inventing one', async () => {
    respondWith([{ ...CONTRACT_INSTAGRAM_DRAFT, replyWindowExpiresAt: null }]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.drafts[0].guestChannel).toBe('instagram');
    expect(result.data.drafts[0].replyWindowExpiresAt).toBeNull();
  });

  // Transcribed from TAC-397's Contract example, second draft.
  it('parses the Contract’s replacedDraft field for field', async () => {
    respondWith([
      {
        ...CONTRACT_INSTAGRAM_DRAFT,
        messageId: '33333333-3333-4333-8333-333333333333',
        guestId: '22222222-2222-4222-8222-222222222222',
        reviewReasonCode: 'previous_pending_held',
        otherPendingDraftsForGuest: 1,
        replacedDraft: {
          body: 'we have oat and whole milk',
          replacedAt: '2026-09-21T16:10:29.000Z',
        },
      },
    ]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.drafts[0].replacedDraft).toEqual({
      body: 'we have oat and whole milk',
      replacedAt: '2026-09-21T16:10:29.000Z',
    });
  });

  // TAC-402's acceptance criterion, verbatim: "a payload missing the field
  // parses as `null`".
  it('parses a payload with no replacedDraft as null', async () => {
    const { replacedDraft: _omitted, ...withoutField } = CONTRACT_INSTAGRAM_DRAFT;
    respondWith([withoutField]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.drafts[0].replacedDraft).toBeNull();
  });

  it('degrades an unreadable replacedDraft to null rather than losing the card', async () => {
    respondWith([{ ...CONTRACT_INSTAGRAM_DRAFT, replacedDraft: 'not an object' }]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.drafts[0].replacedDraft).toBeNull();
    expect(result.data.drafts[0].messageId).toBe(CONTRACT_INSTAGRAM_DRAFT.messageId);
  });

  /**
   * The deliberate loud failure. `guestChannel` is a bare enum with no
   * `.catch()`, so a response missing it fails the WHOLE queue.
   *
   * This test exists to make that a decision rather than an accident. The
   * Contract guarantees the field is always present; if it ever isn't, an empty
   * queue is a page an operator reports in a minute, whereas a `.catch('text')`
   * would render every Instagram card as a text card with no window, no timer
   * and a swipe-right that looks available and dies at the send gate. If you
   * are here because this failed, fix the server, don't soften the schema.
   */
  it('fails the whole queue when guestChannel is missing, on purpose', async () => {
    const { guestChannel: _omitted, ...withoutChannel } = CONTRACT_INSTAGRAM_DRAFT;
    respondWith([withoutChannel]);
    const result = await listQueue();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });

  it('fails the whole queue on a guestChannel the Contract does not define', async () => {
    respondWith([{ ...CONTRACT_INSTAGRAM_DRAFT, guestChannel: 'whatsapp' }]);
    const result = await listQueue();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });

  // Forward-compat: the Contract calls all three fields additive and says the
  // deployed client "ignores unknown keys and keeps working".
  it('ignores fields the Contract has not introduced yet', async () => {
    respondWith([{ ...CONTRACT_INSTAGRAM_DRAFT, somethingAddedLater: 'x' }]);
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.drafts[0].guestChannel).toBe('instagram');
  });
});
