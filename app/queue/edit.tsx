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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { GroundScreen } from '@/components/ground/ground-screen';
import { queueCardDisplayName } from '@/components/queue/queue-card';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { ReviewDetail } from '@/components/queue/review-detail';
import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { SendGlyph } from '@/components/ui/send-glyph';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { clearUndoState, setUndoState } from '@/hooks/use-undo-state';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { type ThreadMessage, editAndSend, getThread, skipDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { clearDeclineHandoff, peekDeclineHandoff } from '@/lib/decline-handoff';
import { useQueueContext } from '@/lib/queue-context';
import {
  type ReviewBucket,
  bucketForDraft,
  isReviewBucket,
  stripLabelForDraft,
} from '@/lib/review-bucket';
import {
  body as bodyType,
  reviewDetail,
  takeoverHeader,
  thread as threadTheme,
  typePresets,
} from '@/lib/theme';
import { computeItems } from '@/lib/thread-cluster';

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
  const params = useLocalSearchParams<{
    messageId?: string;
    prefill?: string;
    /** The card's bucket, so the takeover's ground carries through from the
     *  card you swiped. A decline arrives as `headsUp`, although its draft's
     *  own code is mid-thread. A route param is an untrusted string, so it is
     *  checked before use. (TAC-364.) */
    bucket?: string;
  }>();
  const queue = useQueueContext();
  const insets = useSafeAreaInsets();
  // A decline draft reaches this screen before it reaches the queue: the server
  // created it moments ago, so the cached list cannot hold it yet. The queue
  // screen stages one built from the commitment and the decline response, and
  // it stands in until the realtime reload brings the real row, which then
  // wins. Without it, every decline opened on "That draft is no longer
  // pending". Keyed on `messageId`, so it can never stand in for any other
  // draft. (TAC-364; see lib/decline-handoff.ts.)
  const handoff = useMemo(
    () => peekDeclineHandoff(params.messageId),
    [params.messageId],
  );
  const draft = useMemo(
    () =>
      queue.drafts.find((d) => d.messageId === params.messageId) ?? handoff,
    [queue.drafts, params.messageId, handoff],
  );
  useEffect(() => {
    const messageId = params.messageId;
    return () => {
      if (messageId) clearDeclineHandoff(messageId);
    };
  }, [params.messageId]);

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
  // Prefer the venue's timezone (from the queue payload) so times read as
  // venue-local; fall back to the device timezone when it's absent.
  const timezone = useMemo(
    () => draft?.venueTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [draft?.venueTimezone],
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
      <GroundScreen name="resting">
        <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: 32 }}>
          <Text
        allowFontScaling={false}
            className="font-fraunces"
            style={{ fontSize: 26, lineHeight: 32, color: '#FFFFFF', textAlign: 'center' }}
          >
            That draft is no longer pending.
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to queue"
            // Object form: structural styles are dropped in the
            // `({ pressed }) => ...` form on device.
            style={{
              marginTop: 24,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.4)',
              borderRadius: 999,
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
          >
            <TrackedCaps {...typePresets.link} color="#FFFFFF" decorative>
              Back
            </TrackedCaps>
          </Pressable>
        </View>
      </GroundScreen>
    );
  }

  // Keyed on whether the DRAFT had text, not on whether the composer is
  // currently empty — the placeholder only renders when the field is empty, so
  // keying on `text` would make every card read "Type your answer". An operator
  // who clears a real draft is still editing a message that exists; an operator
  // who swiped left off a gap card is answering from scratch. Same `hasDraft`
  // split the queue card uses, so the two surfaces agree. (TAC-310.)
  const hasDraft = draft.draftBody.trim().length > 0;
  const bucket: ReviewBucket = isReviewBucket(params.bucket)
    ? params.bucket
    : bucketForDraft(draft);

  const handleSend = async (): Promise<void> => {
    if (submitting) return;
    const body = text.trim();
    if (!body) {
      showToast('Add some text or tap "Don\'t send anything"');
      return;
    }
    setSubmitting('edit');
    queue.optimisticallyRemove(draft.messageId);
    void setUndoState({ action: 'edit', draft, body });
    router.back();
    const result = await editAndSend(draft.messageId, body);
    if (!result.ok) {
      void clearUndoState();
      queue.restore(draft);
      showToast(CARD_COPY.toast.sendFailed);
      // Re-open the takeover with the operator's typed text preserved (settled decision: their text is sacred).
      router.push({
        pathname: '/queue/edit',
        params: { messageId: draft.messageId, prefill: body, bucket },
      });
    }
    setSubmitting(null);
  };

  const handleSkip = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting('skip');
    queue.optimisticallyRemove(draft.messageId);
    void setUndoState({ action: 'skip', draft });
    router.back();
    const result = await skipDraft(draft.messageId);
    if (!result.ok) {
      void clearUndoState();
      queue.restore(draft);
      showToast(CARD_COPY.toast.skipFailed);
    }
    setSubmitting(null);
  };

  const reasoning = draft.agentReasoning?.trim();
  const canSend = text.trim().length > 0;

  return (
    // KeyboardAvoidingView must own the full-screen frame for its keyboard
    // offset math to be correct on iOS. Nesting it inside the safe-area view
    // (the shape we shipped first) made it measure from the safe-area-adjusted
    // origin and the pinned composer never lifted above the keyboard.
    // GroundScreen supplies the safe area itself, minus the bottom edge, which
    // the composer's own inset padding handles when the keyboard is down.
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* The takeover's ground is the ground of the card you swiped, so the
          colour carries through instead of cutting to a new screen. */}
      <GroundScreen name={bucket}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: takeoverHeader.rowPaddingTopPx }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to queue"
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <TrackedCaps size={10} tracking={2.2} color="#FFFFFF" decorative>
                {'‹ Back'}
              </TrackedCaps>
            </Pressable>
          </View>
          <View style={{ flex: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TrackedCaps
              {...typePresets.cardName}
              color="#FFFFFF"
              lineHeight={takeoverHeader.nameLineHeightPx}
              // One line: the header's contrast budget counts exactly one.
              numberOfLines={1}
            >
              {queueCardDisplayName(draft)}
            </TrackedCaps>
            <RecognitionBadge state={draft.recognitionState} variant="ground" />
          </View>
          {/* Empty, and load-bearing: it balances the Back column so the name
              sits centred on the screen rather than centred on what's left. */}
          <View style={{ flex: 1 }} />
        </View>

        {/* This header sits directly on the card's ground, and that bounds how
            long it can get: on Honey, white text holds 4.5:1 only in about the
            top third of the screen. Every line below is capped by
            `reviewDetail.takeover`, and __tests__/lib/ground-contrast.test.ts
            adds the caps up against that limit. Recompute before adding a line.
            (TAC-364.) */}
        <View
          style={{
            paddingHorizontal: takeoverHeader.blockPaddingHorizontalPx,
            paddingTop: takeoverHeader.blockPaddingTopPx,
            paddingBottom: takeoverHeader.blockPaddingBottomPx,
          }}
        >
          <TrackedCaps {...typePresets.flagReason} color="#FFFFFF" numberOfLines={1}>
            {bucket === 'headsUp'
              ? CARD_COPY.strip.commitment
              : stripLabelForDraft(draft)}
          </TrackedCaps>
          <ReviewDetail
            draft={draft}
            surface="takeover"
            style={{ marginTop: reviewDetail.gapPx }}
          />
          {reasoning ? (
            <Text
              allowFontScaling={false}
              accessibilityLabel="Agent reasoning"
              className="font-inter-tight"
              numberOfLines={reviewDetail.takeover.reasoningLines}
              style={{
                marginTop: reviewDetail.gapPx,
                fontSize: bodyType.reasoning.size,
                lineHeight: reviewDetail.lineHeightPx,
                color: '#FFFFFF',
              }}
            >
              {reasoning}
            </Text>
          ) : null}
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            gap: 6,
            paddingHorizontal: 22,
            paddingVertical: 8,
          }}
        >
          <ThreadBubbleList items={items} surface="card" />
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 8 }}>
          <View style={{ position: 'relative' }}>
            <TextInput
              // Stable regardless of draft state, and deliberately unchanged
              // from the pre-redesign screen: the visible placeholder follows
              // the new design, but what a screen reader announces is an
              // accessibility contract, not styling.
              accessibilityLabel="Edit the draft before sending"
              className="font-inter-tight"
              value={text}
              onChangeText={setText}
              multiline
              editable={!submitting}
              placeholder={
                hasDraft ? 'Edit the message…' : 'Type your answer to send to the guest'
              }
              placeholderTextColor="#6F6658"
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                minHeight: 78,
                paddingTop: 14,
                paddingBottom: 14,
                paddingLeft: 16,
                paddingRight: 54,
                fontSize: 13.5,
                lineHeight: 20,
                color: '#1C1814',
                textAlignVertical: 'top',
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send my version"
              accessibilityState={{ disabled: !canSend || submitting !== null }}
              disabled={!canSend || submitting !== null}
              onPress={() => void handleSend()}
              hitSlop={8}
              style={{ position: 'absolute', right: 9, bottom: 13 }}
            >
              <SendGlyph size={32} opacity={canSend ? 1 : 0.4} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Don't send anything"
            onPress={() => void handleSkip()}
            disabled={submitting !== null}
            // Object form — the function form is dropped on device and this
            // rendered left-aligned and crammed under the textarea. Cause
            // unknown; see the CLAUDE.md gotcha before changing it back.
            style={{ marginTop: 16, paddingBottom: 28, alignSelf: 'center' }}
          >
            <TrackedCaps
              size={9.5}
              tracking={2.2}
              color="rgba(255,255,255,0.85)"
              decorative
            >
              Don&apos;t send anything
            </TrackedCaps>
          </Pressable>
        </View>
      </GroundScreen>
    </KeyboardAvoidingView>
  );
}
