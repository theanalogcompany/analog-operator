import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { type PendingDraft } from '@/lib/api/queue';
import { supabase } from '@/lib/supabase/client';
import { undoToast } from '@/lib/theme';

export type UndoAction = 'approve' | 'edit' | 'skip';

export type UndoRecord = {
  action: UndoAction;
  message_id: string;
  /** The full draft, kept locally so undo can restore the card without re-fetching. */
  draft: PendingDraft;
  /** Operator's typed body, only present on action === 'edit'. */
  body: string | null;
  expires_at: number;
};

// v2 (TAC-270 follow-up): the embedded `draft: PendingDraft` shape changed
// to match the server `QueueDraft` contract. Bumping the key so an in-flight
// undo from a pre-upgrade app cold-launches into a missing-record state
// instead of rehydrating a malformed draft.
const STORAGE_KEY = 'analog-operator.undo-state.v2';

let current: UndoRecord | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const subscribers: Set<(state: UndoRecord | null) => void> = new Set();

function notify(): void {
  subscribers.forEach((fn) => fn(current));
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleExpiry(): void {
  clearTimer();
  if (!current) return;
  const remaining = current.expires_at - Date.now();
  if (remaining <= 0) {
    void clearUndoState();
    return;
  }
  timer = setTimeout(() => {
    void clearUndoState();
  }, remaining);
}

export function getUndoState(): UndoRecord | null {
  return current;
}

export async function setUndoState(args: {
  action: UndoAction;
  draft: PendingDraft;
  body?: string;
}): Promise<void> {
  current = {
    action: args.action,
    message_id: args.draft.messageId,
    draft: args.draft,
    body: args.action === 'edit' ? (args.body ?? null) : null,
    expires_at: Date.now() + undoToast.windowMs,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // best effort — non-persistent window still works
  }
  notify();
  scheduleExpiry();
}

export async function clearUndoState(): Promise<void> {
  clearTimer();
  current = null;
  // Notify BEFORE awaiting storage. Subscribers render from `current`, so
  // deferring the notification until after an AsyncStorage round-trip leaves
  // the toast on screen for a cleared record — visible as a flash of an
  // already-expired undo when a remount re-arms expiry below.
  notify();
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function rehydrateUndoState(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as UndoRecord;
    if (typeof parsed.expires_at !== 'number') return;
    if (parsed.expires_at <= Date.now()) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    current = parsed;
    notify();
    scheduleExpiry();
  } catch {
    // malformed — ignore
  }
}

/** Subscribe to sign-out events and clear any pending undo window. */
export function wireUndoAutoClearOnSignOut(): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      void clearUndoState();
    }
  });
  return () => data.subscription.unsubscribe();
}

export function useUndoState(): UndoRecord | null {
  const [state, setState] = useState<UndoRecord | null>(current);
  useEffect(() => {
    subscribers.add(setState);
    // Re-arm expiry on mount. The cleanup below disposes the module-level
    // timer when the last subscriber unmounts while deliberately leaving
    // `current` set, so without this a record that outlived its window while
    // nothing was mounted would come back on the next mount with a full drain
    // bar and an undo that is no longer live. `scheduleExpiry` clears
    // immediately when the window has already closed, so the stale record
    // resolves instead of lingering.
    //
    // TAC-382 made this path routine rather than theoretical: the venue picker
    // lives on the You screen, so every venue switch unmounts the queue screen
    // — and with it the only UndoToast — mid-window. The ruling on that ticket
    // requires the undo window to SURVIVE a venue switch, which means it has to
    // survive accurately: still live if time remains, gone if it does not.
    if (current) scheduleExpiry();
    return () => {
      subscribers.delete(setState);
      // When the last subscriber unmounts, dispose the module-level expiry
      // timer so a 3s setTimeout doesn't keep the Node worker alive after a
      // test suite finishes. Note: this leaves `current` non-null on purpose
      // — today the only subscriber is the single UndoToast rendered by
      // app/queue/index.tsx, which stays mounted for the queue session, so
      // the "last unmount" path is effectively only hit at app teardown /
      // sign-out (both of which clear `current` explicitly). If a future
      // refactor mounts UndoToast in a sub-screen that unmounts mid-window,
      // also null out `current` here or stale state will linger.
      if (subscribers.size === 0) clearTimer();
    };
  }, []);
  return state;
}
