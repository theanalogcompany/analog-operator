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
  useWindowDimensions,
} from 'react-native';
import { type Edge, useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { Ground } from '@/components/ground/ground';
import { GroundScreen } from '@/components/ground/ground-screen';
import { EmptyState } from '@/components/queue/empty-state';
import { queueCardDisplayName } from '@/components/queue/queue-card';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { ReplyQuote, lastRenderedMessageId } from '@/components/queue/reply-quote';
import { ReviewDetail } from '@/components/queue/review-detail';
import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { SendGlyph } from '@/components/ui/send-glyph';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { clearUndoState, setUndoState } from '@/hooks/use-undo-state';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { type ThreadMessage, editAndSend, getThread, skipDraft } from '@/lib/api/queue';
import { windowState } from '@/lib/reply-window';
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

/**
 * The takeover pads its own top. It opens as a `transparentModal`, where the
 * native safe-area view reports no top inset, so its header drew under the
 * status bar while the Texts thread, the same header shape on an ordinary push,
 * sat clear of it (confirmed on device, 2026-09-14). The root provider's inset
 * is the window's, whatever presented the screen. (TAC-388.)
 */
const TAKEOVER_EDGES: readonly Edge[] = ['left', 'right'];

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

// Drop a message that stopped counting. The channel decides — see
// `countsAsThreadRow` in lib/realtime/thread-channel.ts — and this only
// applies the verdict, so a row the operator is looking at leaves without
// the screen being reopened. Returns `current` untouched when the id isn't
// present, so React skips the re-render. (TAC-411.)
function removeMessage(current: ThreadMessage[], id: string): ThreadMessage[] {
  const idx = current.findIndex((m) => m.id === id);
  if (idx < 0) return current;
  return [...current.slice(0, idx), ...current.slice(idx + 1)];
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
  const windowSize = useWindowDimensions();
  // The height the ground is drawn at, so the pinned header's backing lines up
  // with it. The keyboard shortens it.
  const [frameHeight, setFrameHeight] = useState(0);
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

  const handleRemove = useCallback((id: string) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: removeMessage(prev.messages, id),
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
    onRemove: handleRemove,
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

  // A takeover with no bubbles at all became reachable with TAC-395: a guest
  // whose only inbound was media-only carries an empty body, which fails the
  // Contract's condition 1, so both `recentContext` and the thread endpoint
  // come back with nothing for them. Before this the thread area just sat
  // blank, which reads as a screen that failed to load rather than a guest
  // nobody has reached. Same copy and same component as the Conversations
  // thread — the two surfaces answer the same question and should not answer
  // it differently. Held back while the fetch is out, because "nothing has
  // reached this guest" is a claim we don't have yet.
  //
  // Note this is NOT the empty-DRAFT case: a blank `draftBody` still renders
  // its own placeholder in the composer below (TAC-310), and says nothing
  // about the thread. (TAC-411.)
  //
  // The error branch needs one more guard, and it is not symmetric with the
  // loading one. On error the screen keeps its `recentContext` seed, and for a
  // draft out of the queue cache that seed IS the server's answer to this same
  // question — same condition-1 filter — so an empty one supports the claim.
  // A DECLINE HANDOFF's seed is not: `buildDeclineHandoffDraft` hardcodes
  // `recentContext: []` as a placeholder meaning "unknown", for a guest the
  // agent has by construction already promised something to. Claiming nothing
  // reached them, above an apology addressed to them, is the same false
  // statement this copy was chosen to avoid. So on error we only claim when
  // the seed came from the server. (TAC-411; see lib/decline-handoff.ts.)
  const seedIsFabricated = draft !== null && draft === handoff;
  const showEmptyThread =
    threadState.kind !== 'loading' &&
    threadState.messages.length === 0 &&
    !(threadState.kind === 'error' && seedIsFabricated);

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
    /**
     * The takeover is the SECOND send path, and it outlives the swipe that
     * opened it.
     *
     * Swipe-left is blocked once the window has shut, but a takeover opened
     * while it was open stays open and sendable across expiry, and a long edit
     * outlasts the 5-minute display margin easily. Without this the send goes
     * out, the server refuses it (`/edit` returns 502 for a closed Instagram
     * window), and the operator gets a generic "couldn't send" toast that says
     * nothing about the window, on a card that stays queued.
     *
     * Checked at press time rather than on a timer: nothing else on this screen
     * needs the clock, and a takeover that rearranged itself mid-edit would
     * throw away the operator's typed text, which is sacred here.
     */
    const window = windowState({
      expiresAt: draft.replyWindowExpiresAt,
      channel: draft.guestChannel,
      nowMs: Date.now(),
    });
    if (window.kind === 'closed') {
      showToast(CARD_COPY.replyWindow.closedMidSwipe);
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
    // GroundScreen supplies the left and right safe area. The header row pads
    // the top itself (see `TAKEOVER_EDGES`), and the composer's own inset
    // padding handles the bottom when the keyboard is down.
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* The takeover's ground is the ground of the card you swiped, so the
          colour carries through instead of cutting to a new screen. */}
      <GroundScreen name={bucket} edges={TAKEOVER_EDGES}>
        <View
          style={{ flex: 1 }}
          onLayout={(event) => setFrameHeight(event.nativeEvent.layout.height)}
        >
          {/* The header row and the pinned block, drawn above the thread. The
              backing is the takeover's own ground at the frame's full height,
              clipped to this block: opaque to the thread scrolling beneath it,
              and indistinguishable from the ground around it. A flat fill would
              band against a gradient. (TAC-388.) */}
          <View testID="takeover-pinned-header" style={{ zIndex: 1, overflow: 'hidden' }}>
            <View
              testID="takeover-pinned-backing"
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: frameHeight || windowSize.height,
              }}
            >
              <Ground name={bucket} />
            </View>

            <View
              testID="takeover-header-row"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingTop: insets.top + takeoverHeader.rowPaddingTopPx,
              }}
            >
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
          </View>

          {/* Clipped, so no part of the thread can draw above its own top edge
              and into the header. (TAC-388.) */}
          <View testID="takeover-thread-clip" style={{ flex: 1, overflow: 'hidden' }}>
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
              {showEmptyThread ? (
                <EmptyState variant="thread" backed />
              ) : (
                <ThreadBubbleList items={items} surface="card" />
              )}
            </ScrollView>
          </View>

          {/* What this draft is answering, when the thread does not already end
              on it. Same rule and same component as the card, on the broader
              reading of TAC-533's "a card": this is where the operator rewrites
              the reply, so it is where the question matters most. Ruled
              2026-09-23. */}
          <ReplyQuote
            replyingTo={draft?.replyingTo ?? null}
            lastRenderedMessageId={lastRenderedMessageId(items)}
            surface="takeover"
            style={{ paddingHorizontal: 20, paddingTop: 10 }}
          />

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
        </View>
      </GroundScreen>
    </KeyboardAvoidingView>
  );
}
