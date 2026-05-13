import * as fixtures from '@/lib/fixtures/queue';
import {
  approveDraft,
  editAndSend,
  listQueue,
  skipDraft,
  undoAction,
} from '@/lib/api/queue';

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = '';
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

  it('listQueue results pass Zod validation (real-shaped UUIDs)', async () => {
    const result = await listQueue();
    if (!result.ok) throw new Error('listQueue should succeed in fixture mode');
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const draft of result.data) {
      expect(uuidRe.test(draft.id)).toBe(true);
      expect(uuidRe.test(draft.guest_id)).toBe(true);
    }
  });

  it('approveDraft removes the draft from the fixture queue', async () => {
    const before = (await listQueue()) as { ok: true; data: { id: string }[] };
    const target = before.data[0].id;
    await approveDraft(target);
    const after = (await listQueue()) as { ok: true; data: { id: string }[] };
    expect(after.data.find((d) => d.id === target)).toBeUndefined();
  });

  it('skipDraft removes the draft', async () => {
    const before = (await listQueue()) as { ok: true; data: { id: string }[] };
    const target = before.data[0].id;
    await skipDraft(target);
    const after = (await listQueue()) as { ok: true; data: { id: string }[] };
    expect(after.data.find((d) => d.id === target)).toBeUndefined();
  });

  it('editAndSend removes the draft on first call', async () => {
    const before = (await listQueue()) as { ok: true; data: { id: string }[] };
    const target = before.data[0].id;
    await editAndSend(target, 'my version');
    const after = (await listQueue()) as { ok: true; data: { id: string }[] };
    expect(after.data.find((d) => d.id === target)).toBeUndefined();
  });

  it('undoAction restores a removed draft', async () => {
    const before = (await listQueue()) as { ok: true; data: { id: string }[] };
    const target = before.data[0].id;
    await approveDraft(target);
    await undoAction(target);
    const after = (await listQueue()) as { ok: true; data: { id: string }[] };
    expect(after.data.find((d) => d.id === target)).toBeDefined();
  });
});

describe('lib/api/queue HTTP shape', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
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

  it('approveDraft posts to /api/operator/queue/:id/approve', async () => {
    await approveDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/queue/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/approve',
    );
    expect(init.method).toBe('POST');
  });

  it('editAndSend posts JSON body to /api/operator/queue/:id/edit', async () => {
    await editAndSend('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d', 'my version');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/queue/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/edit',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ body: 'my version' });
  });

  it('skipDraft posts to /api/operator/queue/:id/skip', async () => {
    await skipDraft('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/queue/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/skip',
    );
  });

  it('undoAction posts to /api/operator/queue/:id/undo', async () => {
    await undoAction('11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test/api/operator/queue/11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d/undo',
    );
  });
});
