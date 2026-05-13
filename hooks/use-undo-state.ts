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

const STORAGE_KEY = 'analog-operator.undo-state.v1';

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
    message_id: args.draft.id,
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
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
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
    return () => {
      subscribers.delete(setState);
    };
  }, []);
  return state;
}
