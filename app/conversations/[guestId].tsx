// app/conversations/[guestId].tsx
// Read-only thread viewer for the Conversations tab — no compose box, no
// send/edit/skip actions. The agent handles these conversations
// autonomously; the operator only intervenes via the Queue tab when
// something is flagged.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThreadBubbleList } from '@/components/thread/thread-bubble-list';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { useConversations } from '@/hooks/use-conversations';
import { useThreadRealtime } from '@/hooks/use-thread-realtime';
import { getGuestThread } from '@/lib/api/conversations';
import { type ThreadMessage } from '@/lib/api/queue';
import { formatConversationsSince, isConversationActive } from '@/lib/conversations-format';
import { conversations as conversationsTheme } from '@/lib/theme';
import { computeItems } from '@/lib/thread-cluster';

type ThreadState =
  | { kind: 'loading'; messages: ThreadMessage[] }
  | { kind: 'ready'; messages: ThreadMessage[] }
  | { kind: 'error'; messages: ThreadMessage[] };

export default function ConversationThreadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ guestId: string }>();
  const conversationsResult = useConversations();
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
        setThreadState({ kind: 'ready', messages: result.data });
      } else {
        setThreadState((prev) => ({ kind: 'error', messages: prev.messages }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.guestId]);

  useThreadRealtime({
    venueId: guest?.venueId ?? '',
    guestId: params.guestId ?? '',
    onInsert: (message) => setThreadState((prev) => ({ kind: prev.kind, messages: [...prev.messages, message] })),
    onUpdate: (message) =>
      setThreadState((prev) => ({
        kind: prev.kind,
        messages: prev.messages.map((m) => (m.id === message.id ? message : m)),
      })),
  });

  // Falls back to the device timezone when the venue hasn't got one on file
  // yet — same fallback pattern as `app/queue/edit.tsx`'s `timezone` memo
  // (`draft?.venueTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone`).
  const timezone = guest?.venueTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const items = useMemo(() => computeItems(threadState.messages, timezone), [threadState.messages, timezone]);

  if (!guest) {
    return (
      <SafeAreaView className="flex-1 bg-sand">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-fraunces text-ink" style={{ fontSize: 22, textAlign: 'center' }}>
            That conversation isn&rsquo;t available.
          </Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            className="mt-6 rounded-lg border-[0.5px] border-hairline px-5 py-3"
          >
            <Text className="font-inter-tight-medium uppercase text-ink" style={{ fontSize: 10, letterSpacing: 1.8 }}>
              Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const active = isConversationActive(guest.lastMessageAt, conversationsTheme.activeWindowMins);
  const displayName = guest.name ?? guest.phoneFallback;
  const lastMessage = threadState.messages[threadState.messages.length - 1];
  const lastLine = lastMessage
    ? lastMessage.direction === 'inbound'
      ? `From the guest · ${new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : `Sent by ${guest.agentName} · ${new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : null;

  return (
    <SafeAreaView className="flex-1 bg-sand" edges={['top', 'left', 'right']}>
      <View
        className="flex-row items-center border-b-[0.5px] border-hairline bg-sand"
        style={{ gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to conversations"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={{ fontSize: 22, lineHeight: 22, color: '#1C1814' }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, gap: 3 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 15 }}>
              {displayName}
            </Text>
            <RecognitionBadge state={guest.recognitionState} />
          </View>
          <Text
            className="font-inter-tight text-ink-faint"
            numberOfLines={1}
            style={{ fontSize: 11, letterSpacing: 0.3 }}
          >
            {guest.phoneFallback} · {formatConversationsSince(guest.conversationCount, guest.firstConversationAt, timezone)}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 20,
            backgroundColor: 'rgba(28, 24, 20, 0.05)',
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 5,
              backgroundColor: active ? '#C66A4A' : '#857A6A',
            }}
          />
          <Text
            className="font-inter-tight-medium uppercase text-ink-soft"
            style={{ fontSize: 10, letterSpacing: 1.1 }}
          >
            {active ? 'Live' : 'Quiet'}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, gap: 4 }}
      >
        <ThreadBubbleList items={items} />
        {lastLine ? (
          <Text
            className="self-end font-inter-tight text-ink-faint"
            style={{ fontSize: 10.5, letterSpacing: 0.6, paddingTop: 6 }}
          >
            {lastLine}
          </Text>
        ) : null}
      </ScrollView>

      <View
        className="flex-row border-t-[0.5px] border-hairline bg-paper"
        style={{ gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: '#C66A4A', marginTop: 6 }} />
        <Text className="font-inter-tight text-ink-soft" style={{ fontSize: 12.5, lineHeight: 18, flex: 1 }}>
          {guest.agentName} is handling this one. You&rsquo;ll see it in the queue if it needs your input.
        </Text>
      </View>
    </SafeAreaView>
  );
}
