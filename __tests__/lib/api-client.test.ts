import { authedFetch } from '@/lib/api/client';
import { supabase } from '@/lib/supabase/client';

const ORIGINAL_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
const ORIGINAL_FETCH = global.fetch;

function mockSession(token: string | null) {
  jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
    data: { session: token ? ({ access_token: token } as any) : null },
    error: null,
  } as any);
}

function mockRefresh(success: boolean, token?: string) {
  jest.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
    data: { session: success ? ({ access_token: token ?? 'refreshed-token' } as any) : null },
    error: success ? null : { message: 'expired' },
  } as any);
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
});

afterEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_BASE;
  global.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('authedFetch', () => {
  it('returns NO_SESSION when EXPO_PUBLIC_API_BASE_URL is unset', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const result = await authedFetch('/queue', { method: 'GET' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NO_SESSION');
  });

  it('returns NO_SESSION when there is no session token', async () => {
    mockSession(null);
    const result = await authedFetch('/queue', { method: 'GET' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NO_SESSION');
  });

  it('attaches the Bearer header and returns the Response on 200', async () => {
    mockSession('the-token');
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock as any;
    const result = await authedFetch('/queue', { method: 'GET' });
    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer the-token');
  });

  it('maps a network throw to NETWORK', async () => {
    mockSession('the-token');
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    const result = await authedFetch('/queue', { method: 'GET' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NETWORK');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    mockSession('expired');
    mockRefresh(true, 'fresh-token');
    const calls: { url: string; auth: string }[] = [];
    global.fetch = jest.fn().mockImplementation((url, init) => {
      calls.push({ url: String(url), auth: init.headers.Authorization });
      return Promise.resolve(new Response('{}', { status: calls.length === 1 ? 401 : 200 }));
    }) as any;
    const result = await authedFetch('/queue', { method: 'GET' });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].auth).toBe('Bearer expired');
    expect(calls[1].auth).toBe('Bearer fresh-token');
  });

  it('returns NO_SESSION when refresh fails', async () => {
    mockSession('expired');
    mockRefresh(false);
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 401 })) as any;
    const result = await authedFetch('/queue', { method: 'GET' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NO_SESSION');
  });

  it('returns NO_SESSION when the retry is still 401 — never loops', async () => {
    mockSession('expired');
    mockRefresh(true, 'fresh-but-also-rejected');
    let calls = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve(new Response('{}', { status: 401 }));
    }) as any;
    const result = await authedFetch('/queue', { method: 'GET' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NO_SESSION');
    expect(calls).toBe(2);
  });
});
