import * as fixtures from '@/lib/fixtures/queue';
import {
  type PendingDraft,
  approveDraft,
  editAndSend,
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
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  it('approveDraft removes the draft from the fixture queue', async () => {
    const before = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    const target = before.data[0].messageId;
    await approveDraft(target);
    const after = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    expect(after.data.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('skipDraft removes the draft', async () => {
    const before = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    const target = before.data[0].messageId;
    await skipDraft(target);
    const after = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    expect(after.data.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('editAndSend removes the draft on first call', async () => {
    const before = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    const target = before.data[0].messageId;
    await editAndSend(target, 'my version');
    const after = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    expect(after.data.find((d) => d.messageId === target)).toBeUndefined();
  });

  it('undoAction restores a removed draft', async () => {
    const before = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    const target = before.data[0].messageId;
    await approveDraft(target);
    await undoAction(target);
    const after = (await listQueue()) as { ok: true; data: { messageId: string }[] };
    expect(after.data.find((d) => d.messageId === target)).toBeDefined();
  });

  it('seeded drafts have real-shaped UUIDs for messageId + guestId + venueId', async () => {
    const result = await listQueue();
    if (!result.ok) throw new Error('listQueue should succeed in fixture mode');
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const d of result.data) {
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
      new Response(JSON.stringify({ drafts: [draft] }), { status: 200 }),
    );

    const result = await listQueue();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.test/api/operator/queue');
    expect(init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].messageId).toBe(draft.messageId);
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
});
