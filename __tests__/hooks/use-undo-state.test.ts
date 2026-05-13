import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearUndoState,
  getUndoState,
  rehydrateUndoState,
  setUndoState,
} from '@/hooks/use-undo-state';
import { type PendingDraft } from '@/lib/api/queue';

const STORAGE_KEY = 'analog-operator.undo-state.v1';

function makeDraft(): PendingDraft {
  const now = new Date().toISOString();
  return {
    id: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guest_id: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guest_name: 'Maya R.',
    guest_phone: '+15551110001',
    recognition_band: 'returning',
    recognition_signals: [],
    context_messages: [],
    current_inbound: {
      id: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
      body: 'i',
      direction: 'inbound',
      created_at: now,
    },
    agent_draft: 'a',
    agent_reasoning: null,
    flag_reason: null,
    pending_since: now,
    created_at: now,
  };
}

describe('use-undo-state', () => {
  beforeEach(async () => {
    await clearUndoState();
    await AsyncStorage.clear();
  });

  it('sets and reads an undo record', async () => {
    const draft = makeDraft();
    await setUndoState({ action: 'approve', draft });
    const state = getUndoState();
    expect(state).not.toBeNull();
    expect(state?.action).toBe('approve');
    expect(state?.message_id).toBe(draft.id);
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
    expect(parsed.message_id).toBe(draft.id);
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
        message_id: draft.id,
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
        message_id: draft.id,
        draft,
        body: null,
        expires_at: past,
      }),
    );
    await rehydrateUndoState();
    expect(getUndoState()).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
