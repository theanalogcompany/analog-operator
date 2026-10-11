// app/conversations/[guestId].tsx
// Read-only thread viewer for the Conversations tab — no compose box, no
// send/edit/skip actions. The agent handles these conversations
// autonomously; the operator only intervenes via the Queue tab when
// something is flagged.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroundScreen } from '@/components/ground/ground-screen';
import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { EmptyState } from '@/components/queue/empty-state';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { HandleLink } from '@/components/ui/handle-link';
import { InstagramGlyph } from '@/components/ui/instagram-glyph';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { showToast } from '@/components/auth/toast';
import { CARD_COPY } from '@/lib/card-copy';
import { guestIdentity } from '@/lib/guest-identity';
import { openInstagramThread } from '@/lib/instagram';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { useThreadRefetch } from '@/hooks/use-thread-refetch';
import { getGuestThread } from '@/lib/api/conversations';
import { type ThreadMessage } from '@/lib/api/queue';
import { useConversationsContext } from '@/lib/conversations-context';
import { formatConversationsSince, isConversationActive } from '@/lib/conversations-format';
import {
  body as bodyType,
  conversations as conversationsTheme,
  instagramIdentity,
  typePresets,
} from '@/lib/theme';
import { computeItems } from '@/lib/thread-cluster';
import {
  mergeThreadMessage,
  reconcileFetchedThread,
  reconcileRefetchedThread,
  removeThreadMessage,
} from '@/lib/thread-messages';

type ThreadState =
  | { kind: 'loading'; messages: ThreadMessage[] }
  | { kind: 'ready'; messages: ThreadMessage[] }
  | { kind: 'error'; messages: ThreadMessage[] };

export default function ConversationThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ guestId: string }>();
  const conversationsResult = useConversationsContext();
  const guest = useMemo(
    () => conversationsResult.conversations.find((c) => c.guestId === params.guestId) ?? null,
    [conversationsResult.conversations, params.guestId],
  );

  const [threadState, setThreadState] = useState<ThreadState>({ kind: 'loading', messages: [] });

  // When to fetch the thread again: a live row with media arrived or changed,
  // or a media file's signed URL ran out. The same hook as the edit takeover,
  // for the same reasons. (TAC-583.)
  const {
    tick: refetchTick,
    refetch: handleRefetch,
    onMediaUrlExpired: handleMediaUrlExpired,
    onFetched,
    onFetchFailed,
  } = useThreadRefetch();
  // The guest whose thread has loaded at least once. A fetch after that is a
  // REFETCH, which reconciles differently and fails differently.
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    const guestId = params.guestId;
    if (!guestId) return;
    let cancelled = false;
    void (async () => {
      const result = await getGuestThread(guestId);
      if (cancelled) return;
      const isRefetch = loadedForRef.current === guestId;
      if (result.ok) {
        loadedForRef.current = guestId;
        onFetched(result.data);
        // Reconcile against any Realtime messages that landed during the
        // fetch window — the server response is authoritative for messages
        // it includes, but we don't want to drop a live arrival that beat
        // the response back. A refetch has its own rule: see
        // `reconcileRefetchedThread`.
        setThreadState((prev) => ({
          kind: 'ready',
          messages: isRefetch
            ? reconcileRefetchedThread(result.data, prev.messages)
            : reconcileFetchedThread(result.data, prev.messages),
        }));
      } else if (!isRefetch) {
        setThreadState((prev) => ({ kind: 'error', messages: prev.messages }));
      } else {
        // A failed REFETCH changes nothing on screen: the thread already there
        // is better than an error state, and the next live event tries again.
        onFetchFailed();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.guestId, refetchTick, onFetched, onFetchFailed]);


  // `useCallback` with an empty dep array (functional setState form, no
  // closed-over values) so these handlers keep the same identity across
  // every render. useThreadRealtime's effect depends on [onInsert, onUpdate]
  // — a new identity on every message would tear down and reopen the
  // Realtime channel on every arrival instead of holding one open
  // subscription for the screen's lifetime.
  const handleInsert = useCallback((message: ThreadMessage) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: mergeThreadMessage(prev.messages, message),
    }));
  }, []);

  const handleUpdate = useCallback((message: ThreadMessage) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: mergeThreadMessage(prev.messages, message),
    }));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: removeThreadMessage(prev.messages, id),
    }));
  }, []);

  useThreadRealtime({
    venueId: guest?.venueId ?? '',
    guestId: params.guestId ?? '',
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onRemove: handleRemove,
    onRefetch: handleRefetch,
  });

  // Falls back to the device timezone when the venue hasn't got one on file
  // yet — same fallback pattern as `app/queue/edit.tsx`'s `timezone` memo
  // (`draft?.venueTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone`).
  const timezone = guest?.venueTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Fetch failure with nothing else cached for this guest (no per-thread
  // cache exists here, unlike the queue edit screen's recentContext) would
  // otherwise render a blank thread area. Fall back to a single synthetic
  // bubble built from the conversations-list summary already in hand — per
  // the design spec's Error Handling section: "falls back to whatever the
  // list already had cached for that guest's last message... must not show
  // a blank screen on fetch failure." This synthetic message never goes
  // through ThreadMessageSchema, so its id doesn't need to be a real UUID.
  //
  // An EMPTY preview builds no bubble. It means no message has reached this
  // guest, so their `lastMessageDirection` comes from an unsent draft and a
  // bubble here would show the operator a message nobody has received — the
  // defect this ticket exists to fix, rebuilt on the client. The empty state
  // below covers the screen instead. (TAC-411; TAC-395 Contract, "What it
  // may not assume".)
  //
  // A guest whose last message was MEDIA has an empty preview too, but for the
  // opposite reason: there is a message, it just has no text. The list names
  // it in `previewLabel` ("Photo", "Voice note", ...), and that label stands in
  // as the bubble's text. Without this the screen would fall through to the
  // empty state and claim nothing had happened in a thread whose row, one tap
  // back, says the guest sent a photo. The file itself can't be shown: its URL
  // comes from the fetch that just failed. (TAC-583; TAC-582 Contract.)
  const effectiveMessages = useMemo(() => {
    const fallbackBody =
      guest === null
        ? ''
        : guest.lastMessagePreview !== ''
          ? guest.lastMessagePreview
          : (guest.previewLabel ?? '');
    if (
      threadState.kind === 'error' &&
      threadState.messages.length === 0 &&
      guest &&
      fallbackBody !== ''
    ) {
      return [
        {
          id: `fallback-${guest.guestId}`,
          direction: guest.lastMessageDirection,
          body: fallbackBody,
          createdAt: guest.lastMessageAt,
        },
      ];
    }
    return threadState.messages;
  }, [threadState, guest]);

  const items = useMemo(() => computeItems(effectiveMessages, timezone), [effectiveMessages, timezone]);

  // A thread with nothing in it is a real state, not only an error one: after
  // TAC-395 the server returns `{ "messages": [] }` for a guest whose only
  // messages are unsent drafts, so success and failure land in the same place
  // and should read the same. Held back while the fetch is still out, because
  // "nothing has reached this guest" is a claim and we don't know it yet.
  //
  // On `kind: 'error'` we do not know it from this fetch either — the claim
  // there rests on the conversations list instead: an empty `lastMessagePreview`
  // means the server found no counting message for this guest when it built
  // the list, which is the same question the thread endpoint answers. A guest
  // WITH a preview still gets the cached-bubble fallback above, so the error
  // branch only reaches here for a guest the list already said was empty.
  const showEmptyState = threadState.kind !== 'loading' && effectiveMessages.length === 0;

  if (!guest) {
    return (
      <GroundScreen name="resting">
        <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: 32 }}>
          <Text
        allowFontScaling={false}
            className="font-fraunces"
            style={{ fontSize: 26, lineHeight: 32, color: '#FFFFFF', textAlign: 'center' }}
          >
            That conversation isn&rsquo;t available.
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            // Object form: structural styles are dropped in the
            // `({ pressed }) => ...` form on device.
            // Cause unknown; see the CLAUDE.md gotcha before changing it back.
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

  const active = isConversationActive(guest.lastMessageAt, conversationsTheme.activeWindowMins);
  // One chain for every surface. The old `name ?? phoneFallback` rendered
  // BLANK for an unnamed Instagram guest, whose phoneFallback is ''. (TAC-486.)
  const identity = guestIdentity({
    displayName: guest.name,
    instagramUsername: guest.instagramUsername,
    phoneFallback: guest.phoneFallback,
    channel: guest.guestChannel,
  });
  const displayName = identity.name;
  const isInstagram = guest.guestChannel === 'instagram';

  // "Reshare on Instagram" under a story the guest tagged the venue in, while
  // it is still up. The same link and the same rules as the edit takeover:
  // `MediaBubble` decides whether a story gets one, this only says whose
  // thread it opens. Null for a guest with no handle. (TAC-585.)
  const reshareUsername = guest.instagramUsername?.trim() || null;
  const handleReshareStory = async (): Promise<void> => {
    if (!reshareUsername) return;
    const result = await openInstagramThread(reshareUsername);
    // Nothing was copied on the way, so not the clipboard wording.
    if (!result.ok) showToast(CARD_COPY.media.openFailed);
  };
  const since = formatConversationsSince(
    guest.conversationCount,
    guest.firstConversationAt,
    timezone,
  );
  // The old "Sent by Sana · 7:14 PM" trailer is gone: the redesign carries
  // that information in the cluster dividers and the Live/Quiet pill, and a
  // third timestamp treatment on one screen was noise.

  return (
    <GroundScreen name="resting">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 22,
          paddingVertical: 16,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to conversations"
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text allowFontScaling={false} style={{ fontSize: 20, lineHeight: 22, color: '#FFFFFF' }}>‹</Text>
        </Pressable>

        {/* An Instagram thread gains the avatar. A text thread is unchanged. */}
        {isInstagram ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="thread-avatar"
            style={{
              width: instagramIdentity.avatarSizePx,
              height: instagramIdentity.avatarSizePx,
              borderRadius: instagramIdentity.avatarSizePx / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: instagramIdentity.avatarBgOnGround,
            }}
          >
            <Text
              allowFontScaling={false}
              className="font-inter-tight-medium"
              style={{ fontSize: 12, letterSpacing: 0.6, color: '#FFFFFF' }}
            >
              {identity.initial}
            </Text>
          </View>
        ) : null}

        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TrackedCaps {...typePresets.cardName} color="#FFFFFF">
              {displayName}
            </TrackedCaps>
            {isInstagram ? (
              <InstagramGlyph
                size={instagramIdentity.glyph.rowSizePx}
                color="#FFFFFF"
              />
            ) : null}
            <RecognitionBadge state={guest.recognitionState} variant="ground" />
          </View>
          {/* Line 2. An Instagram thread replaces the phone number with the
              handle, as a link out of the app; a text thread keeps it. There is
              no GestureDetector on this screen, so the link is a real
              Pressable. */}
          {isInstagram && identity.handle ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <HandleLink
                handle={identity.handle}
                ink="#FFFFFF"
                underlineColor={instagramIdentity.handle.underlineOnGround}
                mode="button"
                onPress={() => {
                  void openInstagramThread(guest.instagramUsername ?? '').then(
                    (result) => {
                      if (!result.ok) {
                        showToast(CARD_COPY.toast.instagramOpenFailed);
                      }
                    },
                  );
                }}
              />
              <Text
                allowFontScaling={false}
                className="font-inter-tight"
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: instagramIdentity.handle.sizePx,
                  letterSpacing: 0.3,
                  color: 'rgba(255,255,255,0.92)',
                }}
              >
                {`· ${since}`}
              </Text>
            </View>
          ) : (
            <Text
              allowFontScaling={false}
              className="font-inter-tight"
              numberOfLines={1}
              style={{
                fontSize: 10.5,
                letterSpacing: 0.3,
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              {`${guest.phoneFallback} · ${since}`}
            </Text>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.4)',
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 5,
              backgroundColor: active ? '#E5B19C' : 'rgba(255,255,255,0.6)',
            }}
          />
          <TrackedCaps {...typePresets.statePill} color="#FFFFFF" decorative>
            {active ? 'Live' : 'Quiet'}
          </TrackedCaps>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          gap: 6,
          paddingHorizontal: 22,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        {showEmptyState ? (
          <EmptyState variant="thread" />
        ) : (
          <ThreadBubbleList
            items={items}
            surface="thread"
            onMediaUrlExpired={handleMediaUrlExpired}
            onReshareStory={
              reshareUsername ? () => void handleReshareStory() : undefined
            }
          />
        )}
      </ScrollView>

      {/* No composer. This screen is read-only by design — replying happens in
          the queue, where the agent's draft and the flag reason are in front of
          you. A send box here would invite answering without that context. */}
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 22,
          paddingTop: 14,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 5,
            backgroundColor: '#E5B19C',
            marginTop: 7,
          }}
        />
        <Text
        allowFontScaling={false}
          className="font-inter-tight"
          style={{
            flex: 1,
            fontSize: bodyType.reasoning.size,
            lineHeight: bodyType.reasoning.lineHeight,
            color: 'rgba(255,255,255,0.94)',
          }}
        >
          {guest.agentName} is handling this one. You&rsquo;ll see it in the
          queue if it needs your input.
        </Text>
      </View>
    </GroundScreen>
  );
}
