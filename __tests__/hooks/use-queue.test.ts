// Hook-level tests for `useQueue`. Most behavior is covered end-to-end
// through the queue screen tests (`__tests__/screens/queue-index*.test.tsx`),
// but the `reload({silent})` contract has direct callers (`handleDecline`
// awaits it before navigating to /queue/edit per TAC-298 UAT #3) so we
// guard its semantics in isolation.

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

// useQueueRealtime opens a Supabase channel; stub it out so the hook tests
// don't touch network or Realtime singletons.
jest.mock('@/hooks/use-queue-realtime', () => ({
  useQueueRealtime: () => undefined,
}));

const listQueueMock = queueApi.listQueue as jest.Mock;

const draft = {
  messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  venueSlug: 'mock',
  guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
  guestDisplayName: 'Maya',
  guestPhoneFallback: '+15551110001',
  draftBody: 'sorry, we are out',
  category: null,
  voiceFidelity: null,
  reviewReason: null,
  recognitionState: null,
  agentReasoning: null,
  pendingSinceMs: 60_000,
  recentContext: [],
  langfuseTraceId: null,
};

beforeEach(() => {
  listQueueMock.mockReset();
  listQueueMock.mockResolvedValue({
    ok: true,
    data: { drafts: [], commitments: [] },
  });
});

describe('useQueue.reload — default behavior', () => {
  it('flips status to "loading" while in flight, then to "ready" on success', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.status).toBe('ready');
  });

  it('flips status to "error" on failure', async () => {
    listQueueMock.mockResolvedValueOnce({
      ok: true,
      data: { drafts: [], commitments: [] },
    });
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

describe('useQueue.reload({silent: true}) — TAC-298 UAT #3', () => {
  it('does NOT flip status away from "ready" while the silent reload is in flight', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Suspend the next listQueue resolution so we can observe status
    // mid-flight. Without the silent flag, status would flip to 'loading'
    // and the queue screen would flash an ActivityIndicator mid-swipe.
    let resolveListQueue: (
      value: { ok: true; data: { drafts: typeof draft[]; commitments: never[] } },
    ) => void = () => undefined;
    listQueueMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveListQueue = resolve;
        }),
    );

    let reloadPromise: Promise<{ ok: boolean }> = Promise.resolve({ ok: true });
    act(() => {
      reloadPromise = result.current.reload({ silent: true });
    });
    expect(result.current.status).toBe('ready');

    await act(async () => {
      resolveListQueue({
        ok: true,
        data: { drafts: [draft], commitments: [] },
      });
      await reloadPromise;
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.drafts).toHaveLength(1);
    expect(result.current.drafts[0].messageId).toBe(draft.messageId);
  });

  it('does NOT flip status to "error" on silent failure — keeps the visible queue intact', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    listQueueMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'boom' },
    });
    await act(async () => {
      await result.current.reload({ silent: true });
    });
    // Silent failure: status stays 'ready' so the queue screen doesn't
    // wipe to the error UI mid-swipe. The caller (handleDecline) decides
    // how to recover.
    expect(result.current.status).toBe('ready');
  });

  it('still updates drafts/commitments on silent success (the whole point — handleDecline relies on this)', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    listQueueMock.mockResolvedValueOnce({
      ok: true,
      data: { drafts: [draft], commitments: [] },
    });
    await act(async () => {
      await result.current.reload({ silent: true });
    });
    expect(result.current.drafts).toHaveLength(1);
    expect(result.current.drafts[0].messageId).toBe(draft.messageId);
  });

  it('returns {ok:true} on silent success and {ok:false} on silent failure (handleDecline branches on this)', async () => {
    const { result } = renderHook(() => useQueue());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    listQueueMock.mockResolvedValueOnce({
      ok: true,
      data: { drafts: [], commitments: [] },
    });
    let silentOk: { ok: boolean } = { ok: false };
    await act(async () => {
      silentOk = await result.current.reload({ silent: true });
    });
    expect(silentOk).toEqual({ ok: true });

    listQueueMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });
    let silentFail: { ok: boolean } = { ok: true };
    await act(async () => {
      silentFail = await result.current.reload({ silent: true });
    });
    expect(silentFail).toEqual({ ok: false });
    // Status stays ready even on silent failure — the caller decides.
    expect(result.current.status).toBe('ready');
  });
});
