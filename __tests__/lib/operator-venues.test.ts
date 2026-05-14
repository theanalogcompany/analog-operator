import {
  clearOperatorCache,
  fetchOperatorVenueIds,
  getOperator,
  wireOperatorCacheClear,
} from '@/lib/auth/operator';
import { supabase } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => {
  const onAuthStateChange = jest.fn();
  return {
    supabase: {
      auth: {
        getSession: jest.fn(),
        onAuthStateChange,
      },
      from: jest.fn(),
      rpc: jest.fn(),
    },
  };
});

const supabaseFrom = supabase.from as jest.Mock;
const getSession = supabase.auth.getSession as jest.Mock;
const onAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;

const SESSION_USER_ID = '11111111-1111-4111-8111-111111111111';
const OPERATOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function mockOperatorRow() {
  const maybeSingle = jest.fn().mockResolvedValue({
    data: {
      id: OPERATOR_ID,
      phone_number: '+15551234567',
      email: 'op@cafe.com',
      auth_user_id: SESSION_USER_ID,
    },
    error: null,
  });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  supabaseFrom.mockImplementation((table: string) => {
    if (table === 'operators') return { select };
    throw new Error(`unexpected from(${table})`);
  });
  return { select, eq, maybeSingle };
}

function mockVenueRows(rows: { venue_id: string }[]) {
  const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
  const select = jest.fn().mockReturnValue({ eq });
  supabaseFrom.mockImplementation((table: string) => {
    if (table === 'operator_venues') return { select };
    throw new Error(`unexpected from(${table})`);
  });
  return { select, eq };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearOperatorCache();
  onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
});

describe('getOperator', () => {
  it('returns no_session when there is no Supabase session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const result = await getOperator();
    expect(result).toEqual({ ok: false, error: 'no_session' });
  });

  it('looks up the operator row by auth_user_id and returns it', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: SESSION_USER_ID } } },
    });
    const { select, eq } = mockOperatorRow();

    const result = await getOperator();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.operator.id).toBe(OPERATOR_ID);
    expect(select).toHaveBeenCalledWith(
      'id, phone_number, email, auth_user_id',
    );
    expect(eq).toHaveBeenCalledWith('auth_user_id', SESSION_USER_ID);
  });

  it('returns the cached operator on the second call without re-querying', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: SESSION_USER_ID } } },
    });
    mockOperatorRow();

    const first = await getOperator();
    expect(first.ok).toBe(true);

    // Second call: clear from() so any re-query throws.
    supabaseFrom.mockImplementation(() => {
      throw new Error('should not requery on cache hit');
    });
    const second = await getOperator();
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.operator.id).toBe(OPERATOR_ID);
  });

  it('returns not_provisioned when the lookup returns no row', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: SESSION_USER_ID } } },
    });
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    supabaseFrom.mockReturnValue({ select });

    const result = await getOperator();
    expect(result).toEqual({ ok: false, error: 'not_provisioned' });
  });

  it('returns rpc_failed on a Supabase error', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: SESSION_USER_ID } } },
    });
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    supabaseFrom.mockReturnValue({ select });

    const result = await getOperator();
    expect(result).toEqual({ ok: false, error: 'rpc_failed' });
  });
});

describe('fetchOperatorVenueIds', () => {
  it('returns the venue_id list for the given operator', async () => {
    const { select, eq } = mockVenueRows([
      { venue_id: VENUE_A },
      { venue_id: VENUE_B },
    ]);

    const result = await fetchOperatorVenueIds(OPERATOR_ID);
    expect(result).toEqual({ ok: true, venueIds: [VENUE_A, VENUE_B] });
    expect(select).toHaveBeenCalledWith('venue_id');
    expect(eq).toHaveBeenCalledWith('operator_id', OPERATOR_ID);
  });

  it('returns an empty list when the operator has no venues', async () => {
    mockVenueRows([]);
    const result = await fetchOperatorVenueIds(OPERATOR_ID);
    expect(result).toEqual({ ok: true, venueIds: [] });
  });

  it('caches by operatorId on subsequent calls', async () => {
    mockVenueRows([{ venue_id: VENUE_A }]);
    await fetchOperatorVenueIds(OPERATOR_ID);

    supabaseFrom.mockImplementation(() => {
      throw new Error('should not requery on cache hit');
    });
    const second = await fetchOperatorVenueIds(OPERATOR_ID);
    expect(second).toEqual({ ok: true, venueIds: [VENUE_A] });
  });

  it('refetches when called for a different operatorId', async () => {
    mockVenueRows([{ venue_id: VENUE_A }]);
    await fetchOperatorVenueIds(OPERATOR_ID);
    mockVenueRows([{ venue_id: VENUE_B }]);
    const second = await fetchOperatorVenueIds(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    );
    expect(second).toEqual({ ok: true, venueIds: [VENUE_B] });
  });

  it('returns rpc_failed on a Supabase error', async () => {
    const eq = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'boom' } });
    const select = jest.fn().mockReturnValue({ eq });
    supabaseFrom.mockReturnValue({ select });

    const result = await fetchOperatorVenueIds(OPERATOR_ID);
    expect(result).toEqual({ ok: false, error: 'rpc_failed' });
  });

  it('returns invalid_response when a row has no venue_id', async () => {
    const eq = jest
      .fn()
      .mockResolvedValue({ data: [{ venue_id: 'not-a-uuid' }], error: null });
    const select = jest.fn().mockReturnValue({ eq });
    supabaseFrom.mockReturnValue({ select });

    const result = await fetchOperatorVenueIds(OPERATOR_ID);
    expect(result).toEqual({ ok: false, error: 'invalid_response' });
  });
});

describe('wireOperatorCacheClear', () => {
  it('clears the operator + venue cache on SIGNED_OUT', async () => {
    // Capture the listener so the test can drive it directly.
    const listenerRef: { current: ((event: string) => void) | null } = {
      current: null,
    };
    onAuthStateChange.mockImplementation((cb: (event: string) => void) => {
      listenerRef.current = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    // Seed the cache.
    getSession.mockResolvedValue({
      data: { session: { user: { id: SESSION_USER_ID } } },
    });
    mockOperatorRow();
    await getOperator();
    mockVenueRows([{ venue_id: VENUE_A }]);
    await fetchOperatorVenueIds(OPERATOR_ID);

    // Wire and fire SIGNED_OUT.
    const stop = wireOperatorCacheClear();
    expect(listenerRef.current).not.toBeNull();
    listenerRef.current?.('SIGNED_OUT');

    // Cache miss: re-querying should hit the mock again.
    mockVenueRows([{ venue_id: VENUE_B }]);
    const after = await fetchOperatorVenueIds(OPERATOR_ID);
    expect(after).toEqual({ ok: true, venueIds: [VENUE_B] });

    stop();
  });

  it('does not clear on non-sign-out events', async () => {
    const listenerRef: { current: ((event: string) => void) | null } = {
      current: null,
    };
    onAuthStateChange.mockImplementation((cb: (event: string) => void) => {
      listenerRef.current = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    mockVenueRows([{ venue_id: VENUE_A }]);
    await fetchOperatorVenueIds(OPERATOR_ID);

    const stop = wireOperatorCacheClear();
    listenerRef.current?.('TOKEN_REFRESHED');

    supabaseFrom.mockImplementation(() => {
      throw new Error('should not requery — cache should still be hot');
    });
    const after = await fetchOperatorVenueIds(OPERATOR_ID);
    expect(after).toEqual({ ok: true, venueIds: [VENUE_A] });

    stop();
  });
});
