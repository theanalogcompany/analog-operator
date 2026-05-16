import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { FlaggedBanner } from '@/components/queue/flagged-banner';
import { queueCardDisplayName } from '@/components/queue/queue-card';
import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { clearUndoState, setUndoState } from '@/hooks/use-undo-state';
import { editAndSend, skipDraft } from '@/lib/api/queue';

import { useQueueContext } from './_layout';

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
    queue.optimisticallyRemove(draft.messageId);
    void setUndoState({ action: 'edit', draft, body });
    router.back();
    const result = await editAndSend(draft.messageId, body);
    if (!result.ok) {
      void clearUndoState();
      queue.restore(draft);
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
    queue.optimisticallyRemove(draft.messageId);
    void setUndoState({ action: 'skip', draft });
    router.back();
    const result = await skipDraft(draft.messageId);
    if (!result.ok) {
      void clearUndoState();
      queue.restore(draft);
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

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, gap: 8 }}
        >
          {draft.recentContext.map((m) => (
            <View
              key={m.id}
              className={
                m.direction === 'inbound'
                  ? 'self-start rounded-[18px] bg-inbound'
                  : 'self-end rounded-[18px] border-[0.5px] border-hairline bg-paper'
              }
              style={{
                maxWidth: '80%',
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderBottomLeftRadius: m.direction === 'inbound' ? 6 : 18,
                borderBottomRightRadius: m.direction === 'outbound' ? 6 : 18,
              }}
            >
              <Text
                className="font-inter-tight"
                style={{
                  color: m.direction === 'inbound' ? '#F0EDE7' : '#1C1814',
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {m.body}
              </Text>
            </View>
          ))}
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
