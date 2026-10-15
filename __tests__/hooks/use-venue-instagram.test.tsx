import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useVenueInstagram } from '@/hooks/use-venue-instagram';
import { type VenueState, getVenueState } from '@/lib/api/venues';
import { type Result } from '@/lib/api/errors';

jest.mock('@/lib/api/venues', () => ({ getVenueState: jest.fn() }));
const getVenueStateMock = getVenueState as jest.MockedFunction<typeof getVenueState>;

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const connected = (username: string): Result<VenueState> => ({
  ok: true,
  data: { instagram: { status: 'connected', username, expiresAt: null } },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => jest.clearAllMocks());

it('loads the selected venue', async () => {
  getVenueStateMock.mockResolvedValue(connected('a'));
  const { result } = renderHook(() => useVenueInstagram(A));
  expect(result.current.state).toEqual({ kind: 'loading' });
  await act(async () => {});
  expect(getVenueStateMock).toHaveBeenCalledWith(A);
  expect(result.current.state).toEqual({
    kind: 'ready',
    instagram: { status: 'connected', username: 'a', expiresAt: null },
  });
});

it('refetches on a venue switch, and drops the answer for the venue it left', async () => {
  const slowA = deferred<Result<VenueState>>();
  getVenueStateMock.mockImplementation((id) =>
    id === A ? slowA.promise : Promise.resolve(connected('b')),
  );
  const { result, rerender } = renderHook(({ id }: { id: string }) => useVenueInstagram(id), {
    initialProps: { id: A },
  });

  rerender({ id: B });
  await act(async () => {});
  await act(async () => {
    slowA.resolve(connected('a'));
  });

  expect(result.current.state).toEqual({
    kind: 'ready',
    instagram: { status: 'connected', username: 'b', expiresAt: null },
  });
});

it('reports a failed fetch as error, not as a disconnected venue', async () => {
  getVenueStateMock.mockResolvedValue({ ok: false, error: { kind: 'NETWORK', message: 'x' } });
  const { result } = renderHook(() => useVenueInstagram(A));
  await act(async () => {});
  expect(result.current.state).toEqual({ kind: 'error' });
});

it('fetches nothing with no venue selected', async () => {
  const { result } = renderHook(() => useVenueInstagram(null));
  await act(async () => {});
  expect(getVenueStateMock).not.toHaveBeenCalled();
  expect(result.current.state).toEqual({ kind: 'loading' });
});

describe('return to the foreground', () => {
  let listeners: ((s: string) => void)[];
  let remove: jest.Mock;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    listeners = [];
    remove = jest.fn();
    spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listeners.push(handler as (s: string) => void);
      return { remove } as never;
    });
  });
  afterEach(() => spy.mockRestore());

  it('refetches without going back to loading, so an abandoned flow shows no change', async () => {
    getVenueStateMock.mockResolvedValue(connected('a'));
    const { result } = renderHook(() => useVenueInstagram(A));
    await act(async () => {});
    const refetch = deferred<Result<VenueState>>();
    getVenueStateMock.mockReturnValueOnce(refetch.promise);

    act(() => {
      for (const l of listeners) l('active');
    });
    expect(getVenueStateMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({
      kind: 'ready',
      instagram: { status: 'connected', username: 'a', expiresAt: null },
    });
    await act(async () => {
      refetch.resolve(connected('a2'));
    });
    expect(result.current.state).toMatchObject({ instagram: { username: 'a2' } });
  });

  it('drops a slow first load that a foreground refetch overtook', async () => {
    const slowFirst = deferred<Result<VenueState>>();
    getVenueStateMock
      .mockReturnValueOnce(slowFirst.promise)
      .mockResolvedValueOnce(connected('newer'));
    const { result } = renderHook(() => useVenueInstagram(A));

    await act(async () => {
      for (const l of listeners) l('active');
    });
    await act(async () => {
      slowFirst.resolve(connected('older'));
    });

    expect(result.current.state).toMatchObject({ instagram: { username: 'newer' } });
  });

  it('removes its listener on unmount', () => {
    getVenueStateMock.mockResolvedValue(connected('a'));
    const { unmount } = renderHook(() => useVenueInstagram(A));
    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
