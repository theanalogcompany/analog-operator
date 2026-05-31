// Hook-level tests for `useQueue`. Most behavior is covered end-to-end
// through the queue screen tests (`__tests__/screens/queue-index*.test.tsx`).
// What's worth pinning at the hook level is the load-bearing pre-await
// ordering of `setStatus('loading')` — `app/queue/index.tsx::handleDecline`
// fires `reload()` and navigates immediately in the same tick, relying on
// the synchronous status flip so the edit screen mounts with
// `status === 'loading'` and shows a spinner instead of the terminal
// "no longer pending" fallback while `queue.drafts` catches up. If a
// future refactor pushes the setState behind the network call, that
// invariant breaks and the UAT #3 dead-end symptom returns.

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useQueue } from '@/hooks/use-queue';
import * as queueApi from '@/lib/api/queue';

jest.mock('@/lib/api/queue', () => {
  const actual = jest.requireActual('@/lib/api/queue');
  return {
    ...actual,
    listQueue: jest.fn(),
  };
});

jest.mock('@/hooks/use-queue-realtime', () => ({
  useQueueRealtime: () => undefined,
}));

const listQueueMock = queueApi.listQueue as jest.Mock;

beforeEach(() => {
  listQueueMock.mockReset();
  listQueueMock.mockResolvedValue({
    ok: true,
    data: { drafts: [], commitments: [] },
  });
});

describe('useQueue.reload', () => {
  it('flips status to "loading" synchronously (before awaiting listQueue) — TAC-298 UAT #4 invariant', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Suspend the next listQueue resolution so we can observe status
    // mid-flight. The status flip MUST happen synchronously when reload
    // is called, before the network round trip — handleDecline depends
    // on this ordering to mount the edit screen in a 'loading' state
    // (renders a spinner instead of the terminal "no longer pending"
    // fallback) while the freshly-created decline draft catches up.
    let resolveListQueue: (value: {
      ok: true;
      data: { drafts: never[]; commitments: never[] };
    }) => void = () => undefined;
    listQueueMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveListQueue = resolve;
        }),
    );

    let reloadPromise: Promise<void> = Promise.resolve();
    act(() => {
      reloadPromise = result.current.reload();
    });
    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveListQueue({
        ok: true,
        data: { drafts: [], commitments: [] },
      });
      await reloadPromise;
    });
    expect(result.current.status).toBe('ready');
  });

  it('flips status to "error" on failure', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    listQueueMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'boom' },
    });
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.status).toBe('error');
  });
});
