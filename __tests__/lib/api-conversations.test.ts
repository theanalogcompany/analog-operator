import * as fixtures from '@/lib/fixtures/conversations';
import { getGuestThread, listConversations } from '@/lib/api/conversations';

const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;
const ORIGINAL_API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

afterAll(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_API_BASE;
});

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
  fixtures.resetConversationsFixture();
});

describe('lib/api/conversations in fixture mode', () => {
  it('listConversations returns the 15-guest fixture seed', async () => {
    const result = await listConversations();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(15);
  });

  it('getGuestThread returns that guest\'s messages', async () => {
    const list = (await listConversations()) as { ok: true; data: { guestId: string }[] };
    const target = list.data[0].guestId;
    const result = await getGuestThread(target);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.length).toBeGreaterThan(0);
  });

  it('getGuestThread returns [] for an unknown guestId', async () => {
    const result = await getGuestThread('00000000-0000-4000-8000-000000000000');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });
});

describe('lib/api/conversations HTTP shape', () => {
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

  // Transcribed from the Contract in
  // docs/superpowers/specs/2026-09-05-conversations-tab-design.md — not from
  // whatever this file happens to send. Per the repo's contract-boundary
  // testing rule (see CLAUDE.md, TAC-310 postmortem).
  it('listConversations GETs /api/operator/conversations and unwraps the { conversations } envelope', async () => {
    const row = {
      guestId: 'c0111111-1111-4111-8111-111111111111',
      venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      venueSlug: 'mock-sextant-coffee-roasters',
      venueTimezone: 'America/Los_Angeles',
      agentName: 'Sana',
      name: 'Maya R.',
      phoneFallback: '+15551110001',
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      recognitionState: 'returning',
      lastMessageAt: '2026-09-05T21:39:00.000Z',
      lastMessageDirection: 'outbound',
      lastMessagePreview: 'Done — got you down for two at 7:30.',
      conversationCount: 4,
      firstConversationAt: '2026-06-10T18:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ conversations: [row] }), { status: 200 }),
    );
    const result = await listConversations();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.test/api/operator/conversations');
    expect(init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([row]);
  });

  // TAC-411 / TAC-395 Contract, conversations list: "A guest with no counting
  // message is still listed, with `lastMessagePreview` set to `""`". This is a
  // wire claim, so it belongs in this live-mode block — fixture mode
  // short-circuits before `authedFetch` and cannot observe a payload at all
  // (CLAUDE.md, cross-repo rule #5 corollary). The payload below is
  // transcribed from the Contract's own illustrative example.
  it('parses a conversation whose lastMessagePreview is the empty string', async () => {
    const row = {
      guestId: '77777777-7777-4777-8777-777777777777',
      venueId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      venueSlug: 'mock-sextant-coffee-roasters',
      venueTimezone: 'America/Los_Angeles',
      agentName: 'Sana',
      name: null,
      phoneFallback: '+15551110055',
      guestChannel: 'text',
      replyWindowExpiresAt: null,
      instagramUsername: null,
      recognitionState: null,
      lastMessageAt: '2026-09-15T17:00:04.000Z',
      lastMessageDirection: 'outbound',
      lastMessagePreview: '',
      conversationCount: 1,
      firstConversationAt: '2026-09-15T17:00:04.000Z',
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ conversations: [row] }), { status: 200 }),
    );
    const result = await listConversations();
    expect(result.ok).toBe(true);
    // An empty preview must survive the schema rather than failing the whole
    // list to PARSE — every other guest's row rides on the same response.
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].lastMessagePreview).toBe('');
      expect(result.data[0].lastMessageDirection).toBe('outbound');
    }
  });

  it('getGuestThread GETs /api/operator/guests/:guestId/thread and unwraps { messages }', async () => {
    const guestId = 'c0111111-1111-4111-8111-111111111111';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              direction: 'inbound',
              body: 'hey!',
              createdAt: '2026-09-05T18:00:00.000Z',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await getGuestThread(guestId);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://api.test/api/operator/guests/${guestId}/thread`);
    expect(init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        {
          id: '11111111-1111-4111-8111-111111111111',
          direction: 'inbound',
          body: 'hey!',
          createdAt: '2026-09-05T18:00:00.000Z',
        },
      ]);
    }
  });

  it('listConversations returns a PARSE error on a malformed response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ conversations: [{ guestId: 'not-a-uuid' }] }), {
        status: 200,
      }),
    );
    const result = await listConversations();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });
});

/**
 * TAC-473's `## Contract`, conversation-summary half, transcribed from its own
 * JSON example. Same rule as the queue half: expected values come from the
 * Contract, never from the client's schema. (CLAUDE.md, "Cross-repo contracts"
 * rule #5.)
 */
describe('lib/api/conversations against the TAC-473 Contract', () => {
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

  /** The fields the Contract's example elides as `"…": "…"`. */
  const ELIDED = {
    venueSlug: 'le-mils-coffee',
    venueTimezone: 'America/Los_Angeles',
    agentName: 'Sana',
    recognitionState: null,
    lastMessagePreview: 'hello',
    conversationCount: 1,
    firstConversationAt: '2026-06-01T09:00:00.000Z',
  };

  // Transcribed from TAC-473's Contract, `GET /api/operator/conversations`.
  const CONTRACT_CONVERSATION = {
    guestId: '4e8a2f60-9d14-4b7c-a3e5-2f81c6d40a77',
    venueId: '1b0f7a44-2c31-4d88-9a10-77c2e5b31f90',
    name: null,
    phoneFallback: '',
    guestChannel: 'instagram',
    replyWindowExpiresAt: '2026-09-24T09:12:03.000Z',
    instagramUsername: 'hana.brews',
    lastMessageAt: '2026-09-23T09:12:03.000Z',
    lastMessageDirection: 'inbound',
    ...ELIDED,
  };

  function respondWith(conversations: unknown[]): void {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ conversations }), { status: 200 }),
    );
  }

  it('parses the Contract’s Instagram conversation field for field', async () => {
    respondWith([CONTRACT_CONVERSATION]);
    const result = await listConversations();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = result.data;
    expect(row.guestChannel).toBe('instagram');
    expect(row.replyWindowExpiresAt).toBe('2026-09-24T09:12:03.000Z');
    expect(row.instagramUsername).toBe('hana.brews');
    expect(row.name).toBeNull();
    expect(row.phoneFallback).toBe('');
  });

  it('parses a text conversation, which carries no window and no handle', async () => {
    respondWith([
      {
        ...CONTRACT_CONVERSATION,
        name: 'Marcus',
        phoneFallback: '+15551110001',
        guestChannel: 'text',
        replyWindowExpiresAt: null,
        instagramUsername: null,
      },
    ]);
    const result = await listConversations();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].guestChannel).toBe('text');
    expect(result.data[0].replyWindowExpiresAt).toBeNull();
    expect(result.data[0].instagramUsername).toBeNull();
  });

  // Same deliberate loud failure as the queue: see the note on that test.
  it('fails the whole list when guestChannel is missing, on purpose', async () => {
    const { guestChannel: _omitted, ...withoutChannel } = CONTRACT_CONVERSATION;
    respondWith([withoutChannel]);
    const result = await listConversations();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
  });

  it('ignores fields the Contract has not introduced yet', async () => {
    respondWith([{ ...CONTRACT_CONVERSATION, somethingAddedLater: 'x' }]);
    const result = await listConversations();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].guestChannel).toBe('instagram');
  });
});
