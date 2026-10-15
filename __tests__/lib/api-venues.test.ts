// TAC-517 ↔ TAC-516. Every expected path, method and payload below is
// transcribed from TAC-516's `## Contract`, never from lib/api/venues.ts
// (Cross-repo contracts rule 5). Wire-shape assertions live in the live-mode
// block with `fetch` mocked; fixture mode short-circuits before authedFetch.

import { getVenueState, startInstagramConnect } from '@/lib/api/venues';
import { FIXTURE_CENTRAL_PERK_ID, FIXTURE_SEXTANT_ID } from '@/lib/fixtures/venues';
import { supabase } from '@/lib/supabase/client';

const VENUE_ID = '8b985b7e-5f8d-4c67-abff-486aabaa5116';

// The Contract's literal examples.
const CONTRACT_VENUE_PAYLOAD = {
  instagram: {
    status: 'connected',
    username: 'lemilscoffee',
    expiresAt: '2026-11-21T00:00:00.000Z',
  },
};
const CONTRACT_CONNECT_PAYLOAD = {
  authorizationUrl: 'https://www.instagram.com/oauth/authorize?...',
  expiresAt: '2026-09-22T23:10:00.000Z',
};

const ORIGINAL_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;
const ORIGINAL_FETCH = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_BASE;
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
  global.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('live mode', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
    jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'tok' } as never },
      error: null,
    } as never);
  });

  describe('HTTP shape', () => {
    it('GETs /api/operator/venues/[venueId] with the Bearer token', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(CONTRACT_VENUE_PAYLOAD));
      global.fetch = fetchMock as never;

      await getVenueState(VENUE_ID);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://api.test/api/operator/venues/${VENUE_ID}`);
      expect(init.method).toBe('GET');
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('POSTs /api/operator/venues/[venueId]/instagram/connect with the Bearer token', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(CONTRACT_CONNECT_PAYLOAD));
      global.fetch = fetchMock as never;

      await startInstagramConnect(VENUE_ID);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://api.test/api/operator/venues/${VENUE_ID}/instagram/connect`);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer tok');
    });
  });

  describe('getVenueState', () => {
    it("parses the Contract's example payload", async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(CONTRACT_VENUE_PAYLOAD)) as never;
      const result = await getVenueState(VENUE_ID);
      expect(result).toEqual({ ok: true, data: CONTRACT_VENUE_PAYLOAD });
    });

    it.each(['connected', 'disconnected', 'expiring'] as const)('parses status %s', async (status) => {
      const instagram =
        status === 'disconnected'
          ? { status, username: null, expiresAt: null }
          : { status, username: 'lemilscoffee', expiresAt: '2026-11-21T00:00:00.000Z' };
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ instagram })) as never;
      const result = await getVenueState(VENUE_ID);
      expect(result).toEqual({ ok: true, data: { instagram } });
    });

    it('parses a payload with no instagram field, to a null block', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as never;
      expect(await getVenueState(VENUE_ID)).toEqual({ ok: true, data: { instagram: null } });
    });

    it('reads a status outside the Contract as a null block, not as disconnected', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ instagram: { status: 'pending', username: null, expiresAt: null } }),
        ) as never;
      expect(await getVenueState(VENUE_ID)).toEqual({ ok: true, data: { instagram: null } });
    });

    it('costs an unreadable field that field, not the block', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ instagram: { status: 'connected', username: 42, expiresAt: false } }),
        ) as never;
      expect(await getVenueState(VENUE_ID)).toEqual({
        ok: true,
        data: { instagram: { status: 'connected', username: null, expiresAt: null } },
      });
    });

    it('keeps an additive server field from breaking the parse', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ ...CONTRACT_VENUE_PAYLOAD, somethingNew: true })) as never;
      const result = await getVenueState(VENUE_ID);
      expect(result.ok).toBe(true);
    });

    it.each([
      [404, { error: 'not_found' }],
      [500, { error: 'internal_error' }],
    ])('returns an HTTP error on %i', async (status, body) => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(body, status)) as never;
      const result = await getVenueState(VENUE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatchObject({ kind: 'HTTP', status });
    });

    it('returns NETWORK when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never;
      const result = await getVenueState(VENUE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NETWORK');
    });
  });

  describe('startInstagramConnect', () => {
    it("parses the Contract's example payload", async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(CONTRACT_CONNECT_PAYLOAD)) as never;
      expect(await startInstagramConnect(VENUE_ID)).toEqual({
        ok: true,
        data: CONTRACT_CONNECT_PAYLOAD,
      });
    });

    it('treats a 401 that survives the refresh as NO_SESSION', async () => {
      jest.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
        data: { session: { access_token: 'tok2' } },
        error: null,
      } as never);
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401)) as never;
      const result = await startInstagramConnect(VENUE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NO_SESSION');
    });

    it.each([
      [404, { error: 'not_found' }],
      [500, { error: 'internal_error' }],
    ])('returns an HTTP error on %i', async (status, body) => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(body, status)) as never;
      const result = await startInstagramConnect(VENUE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatchObject({ kind: 'HTTP', status });
    });

    it('refuses an authorizationUrl that is not https', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ authorizationUrl: 'javascript:alert(1)', expiresAt: '2026-09-22T23:10:00.000Z' }),
        ) as never;
      const result = await startInstagramConnect(VENUE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('PARSE');
    });

    it('still connects when expiresAt is unreadable', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ authorizationUrl: 'https://www.instagram.com/oauth/authorize?x=1' })) as never;
      expect(await startInstagramConnect(VENUE_ID)).toEqual({
        ok: true,
        data: { authorizationUrl: 'https://www.instagram.com/oauth/authorize?x=1', expiresAt: null },
      });
    });

    it('returns PARSE when authorizationUrl is missing', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ expiresAt: '2026-09-22T23:10:00.000Z' })) as never;
      const result = await startInstagramConnect(VENUE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('PARSE');
    });
  });
});

describe('fixture mode', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
  });

  it('answers from fixtures without touching the network', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    const sextant = await getVenueState(FIXTURE_SEXTANT_ID);
    const perk = await getVenueState(FIXTURE_CENTRAL_PERK_ID);
    const connect = await startInstagramConnect(FIXTURE_SEXTANT_ID);

    expect(sextant.ok && sextant.data.instagram?.status).toBe('connected');
    expect(perk.ok && perk.data.instagram?.status).toBe('expiring');
    expect(connect.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
