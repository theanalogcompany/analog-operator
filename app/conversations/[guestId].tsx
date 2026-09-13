// app/conversations/[guestId].tsx
// Read-only thread viewer for the Conversations tab — no compose box, no
// send/edit/skip actions. The agent handles these conversations
// autonomously; the operator only intervenes via the Queue tab when
// something is flagged.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroundScreen } from '@/components/ground/ground-screen';
import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { getGuestThread } from '@/lib/api/conversations';
import { type ThreadMessage } from '@/lib/api/queue';
import { useConversationsContext } from '@/lib/conversations-context';
import { formatConversationsSince, isConversationActive } from '@/lib/conversations-format';
import {
  body as bodyType,
  conversations as conversationsTheme,
  typePresets,
} from '@/lib/theme';
import { computeItems } from '@/lib/thread-cluster';

type ThreadState =
  | { kind: 'loading'; messages: ThreadMessage[] }
  | { kind: 'ready'; messages: ThreadMessage[] }
  | { kind: 'error'; messages: ThreadMessage[] };

// Replace-by-id for any message already in the list, otherwise insert at the
// correct chronological position. Used both for Realtime INSERTs (where the
// echo of an optimistic send, or a duplicate delivery, dedupes against
// itself) and UPDATEs (where a row mutates after being seen). Copied from
// app/queue/edit.tsx's function of the same name/behavior — kept local
// here rather than extracted to a shared module (fix-round scope).
function mergeMessage(current: ThreadMessage[], next: ThreadMessage): ThreadMessage[] {
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
// is authoritative; we add only ids not already present. Copied from
// app/queue/edit.tsx's function of the same name/behavior.
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

  useEffect(() => {
    if (!params.guestId) return;
    let cancelled = false;
    void (async () => {
      const result = await getGuestThread(params.guestId);
      if (cancelled) return;
      if (result.ok) {
        // Reconcile against any Realtime messages that landed during the
        // fetch window — the server response is authoritative for messages
        // it includes, but we don't want to drop a live arrival that beat
        // the response back.
        setThreadState((prev) => ({
          kind: 'ready',
          messages: reconcileFetchedThread(result.data, prev.messages),
        }));
      } else {
        setThreadState((prev) => ({ kind: 'error', messages: prev.messages }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.guestId]);

  // `useCallback` with an empty dep array (functional setState form, no
  // closed-over values) so these handlers keep the same identity across
  // every render. useThreadRealtime's effect depends on [onInsert, onUpdate]
  // — a new identity on every message would tear down and reopen the
  // Realtime channel on every arrival instead of holding one open
  // subscription for the screen's lifetime.
  const handleInsert = useCallback((message: ThreadMessage) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: mergeMessage(prev.messages, message),
    }));
  }, []);

  const handleUpdate = useCallback((message: ThreadMessage) => {
    setThreadState((prev) => ({
      kind: prev.kind,
      messages: mergeMessage(prev.messages, message),
    }));
  }, []);

  useThreadRealtime({
    venueId: guest?.venueId ?? '',
    guestId: params.guestId ?? '',
    onInsert: handleInsert,
    onUpdate: handleUpdate,
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
  const effectiveMessages = useMemo(() => {
    if (threadState.kind === 'error' && threadState.messages.length === 0 && guest) {
      return [
        {
          id: `fallback-${guest.guestId}`,
          direction: guest.lastMessageDirection,
          body: guest.lastMessagePreview,
          createdAt: guest.lastMessageAt,
        },
      ];
    }
    return threadState.messages;
  }, [threadState, guest]);

  const items = useMemo(() => computeItems(effectiveMessages, timezone), [effectiveMessages, timezone]);

  if (!guest) {
    return (
      <GroundScreen name="neutral">
        <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: 32 }}>
          <Text
            className="font-fraunces"
            style={{ fontSize: 26, lineHeight: 32, color: '#FFFFFF', textAlign: 'center' }}
          >
            That conversation isn&rsquo;t available.
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            style={({ pressed }) => ({
              marginTop: 24,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.4)',
              borderRadius: 999,
              paddingHorizontal: 20,
              paddingVertical: 12,
              opacity: pressed ? 0.88 : 1,
            })}
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
  const displayName = guest.name ?? guest.phoneFallback;
  // The old "Sent by Sana · 7:14 PM" trailer is gone: the redesign carries
  // that information in the cluster dividers and the Live/Quiet pill, and a
  // third timestamp treatment on one screen was noise.

  return (
    <GroundScreen name="neutral">
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
          <Text style={{ fontSize: 20, lineHeight: 22, color: '#FFFFFF' }}>‹</Text>
        </Pressable>

        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TrackedCaps {...typePresets.cardName} color="#FFFFFF">
              {displayName}
            </TrackedCaps>
            <RecognitionBadge state={guest.recognitionState} variant="ground" />
          </View>
          <Text
            className="font-inter-tight"
            numberOfLines={1}
            style={{
              fontSize: 10.5,
              letterSpacing: 0.3,
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            {guest.phoneFallback} ·{' '}
            {formatConversationsSince(
              guest.conversationCount,
              guest.firstConversationAt,
              timezone,
            )}
          </Text>
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
        <ThreadBubbleList items={items} surface="thread" />
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
