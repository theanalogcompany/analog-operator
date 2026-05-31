import {
  HeadsUpCommitmentSchema,
  acknowledgeCommitment,
  declineDraft,
} from '@/lib/api/commitments';
import * as fixtures from '@/lib/fixtures/queue';
import { listQueue } from '@/lib/api/queue';

const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;
const ORIGINAL_API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

afterAll(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_API_BASE;
});

const VALID_COMMITMENT_ID = 'aabbccdd-1111-4222-8333-444455556666';
const VALID_SOURCE_MESSAGE_ID = '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d';
const VALID_RETURNED_MESSAGE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('HeadsUpCommitmentSchema — wire shape parsing', () => {
  it('parses a full payload and transforms heritage snake_case → camelCase', () => {
    const wire = {
      id: VALID_COMMITMENT_ID,
      type: 'comp',
      guest: { name: 'Maya' },
      description: 'oat latte on the house',
      code: '7K2P',
      expected_arrival: '2026-05-30T16:00:00.000Z',
      created_at: '2026-05-30T15:55:00.000Z',
      recognitionState: 'returning',
      sourceMessageId: VALID_SOURCE_MESSAGE_ID,
    };
    const parsed = HeadsUpCommitmentSchema.parse(wire);
    expect(parsed).toEqual({
      id: VALID_COMMITMENT_ID,
      type: 'comp',
      guestName: 'Maya',
      description: 'oat latte on the house',
      code: '7K2P',
      expectedArrival: '2026-05-30T16:00:00.000Z',
      createdAt: '2026-05-30T15:55:00.000Z',
      recognitionState: 'returning',
      sourceMessageId: VALID_SOURCE_MESSAGE_ID,
    });
  });

  it('tolerates missing recognitionState (older deploy / future drift)', () => {
    const wire = {
      id: VALID_COMMITMENT_ID,
      type: 'recommendation',
      guest: { name: 'Devon' },
      description: 'rosemary loaf ready around 7',
      code: null,
      expected_arrival: null,
      created_at: '2026-05-30T15:55:00.000Z',
      sourceMessageId: VALID_SOURCE_MESSAGE_ID,
    };
    const parsed = HeadsUpCommitmentSchema.parse(wire);
    expect(parsed.recognitionState).toBeNull();
  });

  it('tolerates missing sourceMessageId (no triggering inbound)', () => {
    const wire = {
      id: VALID_COMMITMENT_ID,
      type: 'comp',
      guest: { name: '' },
      description: 'something',
      code: 'ABCD',
      expected_arrival: null,
      created_at: '2026-05-30T15:55:00.000Z',
      recognitionState: 'new',
    };
    const parsed = HeadsUpCommitmentSchema.parse(wire);
    expect(parsed.sourceMessageId).toBeNull();
  });

  it('accepts explicit null on both new TAC-299 fields', () => {
    const wire = {
      id: VALID_COMMITMENT_ID,
      type: 'hold',
      guest: { name: 'A' },
      description: 'd',
      code: 'XX99',
      expected_arrival: null,
      created_at: '2026-05-30T15:55:00.000Z',
      recognitionState: null,
      sourceMessageId: null,
    };
    const parsed = HeadsUpCommitmentSchema.parse(wire);
    expect(parsed.recognitionState).toBeNull();
    expect(parsed.sourceMessageId).toBeNull();
  });

  it('rejects unknown commitment type (enum bound)', () => {
    const wire = {
      id: VALID_COMMITMENT_ID,
      type: 'tip',
      guest: { name: 'X' },
      description: 'd',
      code: null,
      expected_arrival: null,
      created_at: '2026-05-30T15:55:00.000Z',
    };
    expect(() => HeadsUpCommitmentSchema.parse(wire)).toThrow();
  });

  it('preserves empty guest name (server sends "" when guest first_name is null)', () => {
    const wire = {
      id: VALID_COMMITMENT_ID,
      type: 'comp',
      guest: { name: '' },
      description: 'd',
      code: 'ABCD',
      expected_arrival: null,
      created_at: '2026-05-30T15:55:00.000Z',
    };
    const parsed = HeadsUpCommitmentSchema.parse(wire);
    expect(parsed.guestName).toBe('');
  });
});

describe('acknowledgeCommitment + declineDraft — fixture mode', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    fixtures.resetQueueFixture();
  });

  it('acknowledgeCommitment removes the commitment from the fixture list', async () => {
    const before = await listQueue();
    if (!before.ok) throw new Error('listQueue should succeed');
    const target = before.data.commitments[0].id;
    const result = await acknowledgeCommitment(target);
    expect(result.ok).toBe(true);
    const after = await listQueue();
    if (!after.ok) throw new Error('listQueue should succeed');
    expect(after.data.commitments.find((c) => c.id === target)).toBeUndefined();
  });

  it('declineDraft removes the commitment and returns a fresh messageId', async () => {
    const before = await listQueue();
    if (!before.ok) throw new Error('listQueue should succeed');
    const target = before.data.commitments[0].id;
    const result = await declineDraft(target);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messageId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
    const after = await listQueue();
    if (!after.ok) throw new Error('listQueue should succeed');
    expect(after.data.commitments.find((c) => c.id === target)).toBeUndefined();
  });

  it('declineDraft on the same commitment twice returns 409 invalid_state (TAC-299 trigger-time cancel)', async () => {
    const before = await listQueue();
    if (!before.ok) throw new Error('listQueue should succeed');
    const target = before.data.commitments[0].id;
    const first = await declineDraft(target);
    expect(first.ok).toBe(true);
    const second = await declineDraft(target);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.kind).toBe('HTTP');
      if (second.error.kind === 'HTTP') {
        expect(second.error.status).toBe(409);
      }
    }
  });
});

describe('acknowledgeCommitment + declineDraft — HTTP shape', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    jest
      .spyOn(require('@/lib/supabase/client').supabase.auth, 'getSession')
      .mockResolvedValue({ data: { session: { access_token: 't' } as any } } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('acknowledgeCommitment POSTs to /api/operator/commitments/:id/acknowledge', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await acknowledgeCommitment(VALID_COMMITMENT_ID);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://api.test/api/operator/commitments/${VALID_COMMITMENT_ID}/acknowledge`,
    );
    expect(init.method).toBe('POST');
    expect(result.ok).toBe(true);
  });

  it('acknowledgeCommitment returns HTTP error on non-200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }),
    );
    const result = await acknowledgeCommitment(VALID_COMMITMENT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('HTTP');
  });

  it('declineDraft POSTs to /api/operator/commitments/:id/draft-decline and parses { messageId }', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messageId: VALID_RETURNED_MESSAGE_ID }), {
        status: 200,
      }),
    );
    const result = await declineDraft(VALID_COMMITMENT_ID);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://api.test/api/operator/commitments/${VALID_COMMITMENT_ID}/draft-decline`,
    );
    expect(init.method).toBe('POST');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.messageId).toBe(VALID_RETURNED_MESSAGE_ID);
  });

  it('declineDraft returns HTTP error on 409 invalid_state (re-swipe-left after cancel)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_state' }), { status: 409 }),
    );
    const result = await declineDraft(VALID_COMMITMENT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'HTTP') {
      expect(result.error.status).toBe(409);
    }
  });

  it('declineDraft returns PARSE on malformed success body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ wrong: 'shape' }), { status: 200 }),
    );
    const result = await declineDraft(VALID_COMMITMENT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });
});
