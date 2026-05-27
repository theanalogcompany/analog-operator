import { registerDeviceToken } from '@/lib/api/devices';
import { supabase } from '@/lib/supabase/client';

const ORIGINAL_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
const ORIGINAL_USE_FIXTURES = process.env.EXPO_PUBLIC_USE_FIXTURES;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
  process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
  jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
    data: { session: { access_token: 'tok' } as never },
    error: null,
  } as never);
});

afterEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_BASE;
  process.env.EXPO_PUBLIC_USE_FIXTURES = ORIGINAL_USE_FIXTURES;
  global.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('registerDeviceToken', () => {
  it("POSTs { token, platform: 'ios' } to /api/operator/devices", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('', { status: 200 }));
    global.fetch = fetchMock as never;

    const result = await registerDeviceToken({ token: 'apns-hex', platform: 'ios' });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/api/operator/devices');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ token: 'apns-hex', platform: 'ios' });
  });

  it("returns PARSE error when the token is empty (strict Zod)", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const result = await registerDeviceToken({ token: '', platform: 'ios' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('PARSE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns HTTP error on 4xx / 5xx", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('boom', { status: 500 })) as never;
    const result = await registerDeviceToken({ token: 'tok', platform: 'ios' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('HTTP');
      if (result.error.kind === 'HTTP') expect(result.error.status).toBe(500);
    }
  });

  it("returns NETWORK error when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never;
    const result = await registerDeviceToken({ token: 'tok', platform: 'ios' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NETWORK');
  });

  it("returns ok in fixture mode without hitting the network", async () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const result = await registerDeviceToken({ token: 'tok', platform: 'ios' });
    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
