import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { AgentReasoning } from '@/components/queue/agent-reasoning';
import { FlaggedBanner } from '@/components/queue/flagged-banner';
import { queueCardDisplayName } from '@/components/queue/queue-card';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { clearUndoState, setUndoState } from '@/hooks/use-undo-state';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { type ThreadMessage, editAndSend, getThread, skipDraft } from '@/lib/api/queue';
import { thread as threadTheme } from '@/lib/theme';
import { computeItems } from '@/lib/thread-cluster';

import { useQueueContext } from './_layout';

type ThreadState =
  | { kind: 'loading'; messages: ThreadMessage[] }
  | { kind: 'ready'; messages: ThreadMessage[] }
  | { kind: 'error'; messages: ThreadMessage[] };

// Replace-by-id for any message already in the list, otherwise insert at the
// correct chronological position. Used both for Realtime INSERTs (where the
// echo of an optimistic outbound dedupes against itself) and UPDATEs (where
// a row mutates after being seen).
function mergeMessage(
  current: ThreadMessage[],
  next: ThreadMessage,
): ThreadMessage[] {
  const existingIdx = current.findIndex((m) => m.id === next.id);
  if (existingIdx >= 0) {
    const out = current.slice();
    out[existingIdx] = next;
    return out;
  }
  const nextMs = Date.parse(next.createdAt);
  for (let i = current.length - 1; i >= 0; i--) {
    if (Date.parse(current[i].createdAt) <= nextMs) {
      return [...current.slice(0, i + 1), next, ...current.slice(i + 1)];
    }
  }
  return [next, ...current];
}

// When the fetched thread arrives, merge any Realtime messages that landed
// during the fetch window so we don't drop a live arrival. Server response
// is authoritative; we add only ids not already present.
function reconcileFetchedThread(
  fetched: ThreadMessage[],
  liveDuringLoad: ThreadMessage[],
): ThreadMessage[] {
  if (liveDuringLoad.length === 0) return fetched;
  const fetchedIds = new Set(fetched.map((m) => m.id));
  const survivors = liveDuringLoad.filter((m) => !fetchedIds.has(m.id));
  if (survivors.length === 0) return fetched;
  return survivors.reduce<ThreadMessage[]>((acc, m) => mergeMessage(acc, m), fetched);
}

export default function EditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ messageId?: string; prefill?: string }>();
  const queue = useQueueContext();
  const insets = useSafeAreaInsets();
  const draft = useMemo(
    () => queue.drafts.find((d) => d.messageId === params.messageId) ?? null,
    [queue.drafts, params.messageId],
  );

  const [text, setText] = useState<string>(params.prefill ?? draft?.draftBody ?? '');
  const [submitting, setSubmitting] = useState<'edit' | 'skip' | null>(null);
  // Thread state initialized with `recentContext` (oldest-first per the
  // PendingDraftSchema parse-boundary sort) so the screen renders bubbles
  // immediately on mount instead of an empty loading state. The fetched full
  // thread replaces this once `getThread` resolves; on error we keep
  // recentContext as the fallback per ticket spec. `RecentContextEntry` and
  // `ThreadMessage` are structurally identical (same four fields), so the
  // assignment is direct.
  const initialMessages = useMemo<ThreadMessage[]>(
    () => draft?.recentContext ?? [],
    [draft],
  );
  const [threadState, setThreadState] = useState<ThreadState>({
    kind: 'loading',
    messages: initialMessages,
  });

  const scrollViewRef = useRef<ScrollView | null>(null);
  // `isNearBottomRef` tracks the most recent scroll position so Realtime
  // inserts can decide whether to auto-scroll. Ref (not state) so the
  // gesture-of-record doesn't trigger re-renders on every onScroll event.
  const isNearBottomRef = useRef<boolean>(true);
  const hasScrolledToBottomOnReadyRef = useRef<boolean>(false);
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const messageId = draft?.messageId;
  useEffect(() => {
    if (!messageId) return;
    let cancelled = false;
    void (async () => {
      const result = await getThread(messageId);
      if (cancelled) return;
      if (result.ok) {
        // Reconcile against any Realtime messages that landed during the
        // fetch window — the server response is authoritative for messages
        // it includes, but we don't want to drop a live arrival that beat
        // the response back. Anything `prev.messages` carries beyond
        // `recentContext` came from `handleInsert`/`handleUpdate`.
        setThreadState((prev) => ({
          kind: 'ready',
          messages: reconcileFetchedThread(result.data, prev.messages),
        }));
      } else {
        // Fall back to recentContext (already in initialMessages) per ticket
        // spec — uniform 401/404/500 handling, don't break the screen.
        setThreadState((prev) => ({ kind: 'error', messages: prev.messages }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  const handleInsert = useCallback((message: ThreadMessage) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: mergeMessage(prev.messages, message),
    }));
    // Auto-scroll only if the operator is currently near the bottom — don't
    // yank them mid-read (per ticket UAT step 5).
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, []);

  const handleUpdate = useCallback((message: ThreadMessage) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: mergeMessage(prev.messages, message),
    }));
  }, []);

  // Open the Realtime channel for this guest-at-venue while the screen is
  // mounted. Hook is a no-op when there's no draft (early-return below
  // handles the not-found UI; calling hooks conditionally is invalid React,
  // so we pass an empty guard pair instead).
  useThreadRealtime({
    venueId: draft?.venueId ?? '',
    guestId: draft?.guestId ?? '',
    onInsert: handleInsert,
    onUpdate: handleUpdate,
  });

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentSize, layoutMeasurement, contentOffset } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      isNearBottomRef.current = distanceFromBottom < threadTheme.nearBottomPx;
    },
    [],
  );

  // Scroll to the bottom on the first ready render (full thread fetched) so
  // the operator opens at the most recent message. Subsequent updates honor
  // the near-bottom rule above.
  useEffect(() => {
    if (threadState.kind !== 'ready') return;
    if (hasScrolledToBottomOnReadyRef.current) return;
    hasScrolledToBottomOnReadyRef.current = true;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: false });
    });
  }, [threadState.kind]);

  const items = useMemo(
    () => computeItems(threadState.messages, timezone),
    [threadState.messages, timezone],
  );

  if (!draft) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-fraunces text-ink" style={{ fontSize: 22, textAlign: 'center' }}>
            That draft is no longer pending.
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to queue"
            className="mt-6 rounded-lg border-[0.5px] border-hairline px-5 py-3"
          >
            <Text
              className="font-inter-tight-medium uppercase text-ink"
              style={{ fontSize: 10, letterSpacing: 1.8 }}
            >
              Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleSend = async (): Promise<void> => {
    if (submitting) return;
    const body = text.trim();
    if (!body) {
      showToast('Add some text or tap "Don\'t send anything"');
      return;
    }
    setSubmitting('edit');
    queue.optimisticallyRemoveDraft(draft.messageId);
    void setUndoState({ action: 'edit', draft, body });
    router.back();
    const result = await editAndSend(draft.messageId, body);
    if (!result.ok) {
      void clearUndoState();
      queue.restoreDraft(draft);
      showToast("Couldn't send — tap to retry");
      // Re-open the takeover with the operator's typed text preserved (settled decision: their text is sacred).
      router.push({
        pathname: '/queue/edit',
        params: { messageId: draft.messageId, prefill: body },
      });
    }
    setSubmitting(null);
  };

  const handleSkip = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting('skip');
    queue.optimisticallyRemoveDraft(draft.messageId);
    void setUndoState({ action: 'skip', draft });
    router.back();
    const result = await skipDraft(draft.messageId);
    if (!result.ok) {
      void clearUndoState();
      queue.restoreDraft(draft);
      showToast("Couldn't skip — tap to retry");
    }
    setSubmitting(null);
  };

  return (
    // KeyboardAvoidingView must own the full-screen frame for its keyboard
    // offset math to be correct on iOS. Nesting it INSIDE SafeAreaView (the
    // shape we shipped first) made KAV measure from the safe-area-adjusted
    // origin and the pinned input never lifted above the keyboard. Inverting
    // the wrap + dropping the bottom safe-area edge (KAV handles bottom
    // padding when the keyboard is up; insets.bottom on the pinned input
    // handles the home-indicator clearance when the keyboard is down) is the
    // canonical fix for react-native-safe-area-context + RN KAV.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center justify-between px-[22px] pb-3 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to queue"
            onPress={() => router.back()}
            className="flex-row items-center"
            hitSlop={12}
          >
            <Feather name="chevron-left" size={20} color="#4A4339" />
            <Text className="font-inter-tight text-ink-soft" style={{ fontSize: 14 }}>
              Back
            </Text>
          </Pressable>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 15 }}>
              {queueCardDisplayName(draft)}
            </Text>
            <RecognitionBadge state={draft.recognitionState} />
          </View>
          <View style={{ width: 60 }} />
        </View>

        <FlaggedBanner reason={draft.reviewReason} variant="edit" />

        <AgentReasoning
          reasoning={draft.agentReasoning}
          paddingTop={12}
          paddingBottom={8}
        />

        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, gap: 4 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {items.map((item) => {
            if (item.kind === 'timestamp') {
              return (
                <View key={item.key} style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <Text
                    className="font-inter-tight uppercase text-ink-faint"
                    style={{ fontSize: 10, letterSpacing: 1.5 }}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            }
            const { message: m, position } = item;
            // Tail corner only on 'only' and 'last' — chained bubbles
            // ('first', 'middle') get full 18px on both bottom corners so
            // they read as a continuous chain.
            const hasTail = position === 'only' || position === 'last';
            const inbound = m.direction === 'inbound';
            return (
              <View
                key={item.key}
                className={
                  inbound
                    ? 'self-start rounded-[18px] bg-inbound'
                    : 'self-end rounded-[18px] border-[0.5px] border-hairline bg-paper'
                }
                style={{
                  maxWidth: '80%',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginTop: position === 'first' || position === 'only' ? 4 : 0,
                  borderBottomLeftRadius: inbound && hasTail ? 6 : 18,
                  borderBottomRightRadius: !inbound && hasTail ? 6 : 18,
                }}
              >
                <Text
                  className="font-inter-tight"
                  style={{
                    color: inbound ? '#F0EDE7' : '#1C1814',
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                >
                  {m.body}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View
          className="border-t-[0.5px] border-hairline bg-white"
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            // Bottom safe-area inset lives on the pinned input rather than on
            // SafeAreaView so the keyboard-up state doesn't double-pad.
            paddingBottom: 12 + insets.bottom,
          }}
        >
          <View className="flex-row items-end" style={{ gap: 10 }}>
            <TextInput
              accessibilityLabel="Edit the draft before sending"
              className="flex-1 rounded-[18px] border border-clay font-inter-tight text-ink"
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontSize: 14.5,
                lineHeight: 22,
                minHeight: 44,
                maxHeight: 140,
              }}
              multiline
              value={text}
              onChangeText={setText}
              placeholder="Edit the message…"
              placeholderTextColor="#857A6A"
              editable={submitting === null}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send my version"
              onPress={handleSend}
              disabled={submitting !== null}
              className="items-center justify-center rounded-full bg-clay"
              style={{
                width: 38,
                height: 38,
                opacity: submitting !== null ? 0.5 : 1,
              }}
            >
              <Feather name="send" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Don't send anything"
            onPress={handleSkip}
            disabled={submitting !== null}
            className="self-center"
            style={{ marginTop: 12, opacity: submitting !== null ? 0.5 : 1 }}
            hitSlop={8}
          >
            <Text
              className="font-inter-tight uppercase text-ink-faint"
              style={{ fontSize: 11, letterSpacing: 1.65 }}
            >
              Don&rsquo;t send anything
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
