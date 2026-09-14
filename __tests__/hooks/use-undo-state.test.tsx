import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  clearUndoState,
  getUndoState,
  rehydrateUndoState,
  setUndoState,
  useUndoState,
} from '@/hooks/use-undo-state';
import { type PendingDraft } from '@/lib/api/queue';
import { undoToast } from '@/lib/theme';

const STORAGE_KEY = 'analog-operator.undo-state.v2';

function makeDraft(): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    draftBody: 'a',
    category: null,
    voiceFidelity: null,
    reviewReason: null,
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
  };
}

describe('use-undo-state', () => {
  beforeEach(async () => {
    await clearUndoState();
    await AsyncStorage.clear();
  });

  // Symmetrical with beforeEach: makes sure no test leaks the 3s expiry
  // setTimeout into the next test (or past suite completion).
  afterEach(async () => {
    await clearUndoState();
  });

  it('sets and reads an undo record', async () => {
    const draft = makeDraft();
    await setUndoState({ action: 'approve', draft });
    const state = getUndoState();
    expect(state).not.toBeNull();
    expect(state?.action).toBe('approve');
    expect(state?.message_id).toBe(draft.messageId);
    expect(state?.draft).toEqual(draft);
    expect(state?.body).toBeNull();
    expect(state?.expires_at).toBeGreaterThan(Date.now());
  });

  it('stores the typed body on action === edit', async () => {
    const draft = makeDraft();
    await setUndoState({ action: 'edit', draft, body: 'rewritten' });
    expect(getUndoState()?.body).toBe('rewritten');
  });

  it('clears the body on non-edit actions', async () => {
    const draft = makeDraft();
    await setUndoState({ action: 'skip', draft });
    expect(getUndoState()?.body).toBeNull();
  });

  it('persists to AsyncStorage', async () => {
    const draft = makeDraft();
    await setUndoState({ action: 'approve', draft });
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.message_id).toBe(draft.messageId);
  });

  it('clears state and removes the AsyncStorage entry', async () => {
    const draft = makeDraft();
    await setUndoState({ action: 'approve', draft });
    await clearUndoState();
    expect(getUndoState()).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rehydrates from a future expires_at', async () => {
    const draft = makeDraft();
    const future = Date.now() + 5_000;
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        action: 'approve',
        message_id: draft.messageId,
        draft,
        body: null,
        expires_at: future,
      }),
    );
    await rehydrateUndoState();
    const state = getUndoState();
    expect(state).not.toBeNull();
    expect(state?.expires_at).toBe(future);
  });

  it('drops a stale rehydrate (expires_at in the past)', async () => {
    const draft = makeDraft();
    const past = Date.now() - 5_000;
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        action: 'approve',
        message_id: draft.messageId,
        draft,
        body: null,
        expires_at: past,
      }),
    );
    await rehydrateUndoState();
    expect(getUndoState()).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // TAC-382 made the unmount-mid-window path routine: the venue picker lives
  // on the You screen, so switching venues unmounts the queue screen — and the
  // only UndoToast — while the window is open. The ruling requires the window
  // to survive that, which means surviving ACCURATELY: still live if time
  // remains, gone if it does not.
  describe('re-arming across a remount (the venue-switch path)', () => {
    function Probe() {
      const record = useUndoState();
      return record ? <Text>{record.message_id}</Text> : null;
    }

    it('keeps a still-live undo across an unmount and remount', async () => {
      const draft = makeDraft();
      const first = render(<Probe />);
      await act(async () => {
        await setUndoState({ action: 'approve', draft });
      });
      first.unmount();

      const second = render(<Probe />);
      // The window has not elapsed, so the toast is rightly still offered.
      expect(second.getByText(draft.messageId)).toBeTruthy();
      expect(getUndoState()).not.toBeNull();
      second.unmount();
    });

    it('drops an undo whose window closed while nothing was mounted', async () => {
      jest.useFakeTimers();
      try {
        const draft = makeDraft();
        const first = render(<Probe />);
        await act(async () => {
          await setUndoState({ action: 'approve', draft });
        });
        first.unmount();

        // Unmounted, so the expiry timer is disposed and cannot fire. Without
        // the re-arm on mount, this record would come back offering an undo
        // long after the window shut.
        jest.advanceTimersByTime(undoToast.windowMs + 1_000);

        const second = render(<Probe />);
        await act(async () => {});
        expect(getUndoState()).toBeNull();
        expect(second.queryByText(draft.messageId)).toBeNull();
        second.unmount();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('clears the expiry timer when the last subscriber unmounts (state preserved because timer was cleared)', async () => {
    jest.useFakeTimers();
    try {
      function Probe() {
        useUndoState();
        return null;
      }
      const { unmount } = render(<Probe />);

      await act(async () => {
        await setUndoState({ action: 'approve', draft: makeDraft() });
      });

      // Sanity: state is live and the module-level expiry timer is pending.
      expect(getUndoState()).not.toBeNull();

      unmount();

      // Advance past the 3s undoToast window. The assertion below proves the
      // per-mount cleanup disposed the setTimeout — if the timer had leaked,
      // it would have called clearUndoState() and we'd see null here.
      jest.advanceTimersByTime(undoToast.windowMs + 1_000);

      expect(getUndoState()).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
