import * as fixtures from '@/lib/fixtures/queue';
import {
  type PendingDraft,
  approveDraft,
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
  it('listQueue returns the fixture seed (drafts + commitments)', async () => {
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts.length).toBeGreaterThan(0);
      // Commitments seed should also populate (TAC-298 fixture additions).
      expect(result.data.commitments.length).toBeGreaterThan(0);
    }
  });

  it('approveDraft removes the draft from the fixture queue', async () => {
    const before = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    const target = before.data.drafts[0].messageId;
    await approveDraft(target);
    const after = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('skipDraft removes the draft', async () => {
    const before = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    const target = before.data.drafts[0].messageId;
    await skipDraft(target);
    const after = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('editAndSend removes the draft on first call', async () => {
    const before = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    const target = before.data.drafts[0].messageId;
    await editAndSend(target, 'my version');
    const after = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('undoAction restores a removed draft', async () => {
    const before = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    const target = before.data.drafts[0].messageId;
    await approveDraft(target);
    await undoAction(target);
    const after = (await listQueue()) as {
      ok: true;
      data: { drafts: { messageId: string }[] };
    };
    expect(after.data.drafts.find((d) => d.messageId === target)).toBeDefined();
  });

  it('getThread returns the fixture thread including seed extensions for known messageIds', async () => {
    const before = (await listQueue()) as {
      ok: true;
      data: { drafts: PendingDraft[] };
    };
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

  it('editAndSend posts JSON body to /api/operator/messages/:id/edit', async () => {
    await editAndSend('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', 'my version');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/messages/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/edit',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ body: 'my version' });
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
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [draft], commitments: [] }), {
        status: 200,
      }),
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
      expect(result.data.commitments).toEqual([]);
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
      draftBody: 'reply',
      category: null,
      voiceFidelity: null,
      reviewReason: null,
      recognitionState: 'returning',
      pendingSinceMs: 240_000,
      recentContext: [],
      langfuseTraceId: null,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ drafts: [draftWithoutReasoning], commitments: [] }),
        { status: 200 },
      ),
    );

    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts).toHaveLength(1);
      expect(result.data.drafts[0].agentReasoning).toBeNull();
    }
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
    };
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ drafts: [newestFirstPayload], commitments: [] }),
        { status: 200 },
      ),
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
      draftBody: 'reply',
      category: null,
      voiceFidelity: null,
      reviewReason: null,
      recognitionState: 'returning',
      agentReasoning: null,
      pendingSinceMs: 240_000,
      recentContext: [],
      langfuseTraceId: null,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ drafts: [draftWithNullReasoning], commitments: [] }),
        { status: 200 },
      ),
    );

    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts[0].agentReasoning).toBeNull();
    }
  });

  it('listQueue tolerates server omitting commitments (older deploy / TAC-298 rollout)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ drafts: [] }), { status: 200 }),
    );
    const result = await listQueue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drafts).toEqual([]);
      expect(result.data.commitments).toEqual([]);
    }
  });
});
