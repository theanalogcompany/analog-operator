import { Feather } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { type PendingDraft } from '@/lib/api/queue';
import { queueCard } from '@/lib/theme';

import { FlaggedBanner } from './flagged-banner';
import { RecognitionBadge } from './recognition-badge';

function displayName(draft: PendingDraft): string {
  if (draft.guestDisplayName && draft.guestDisplayName.trim().length > 0) {
    return draft.guestDisplayName;
  }
  return draft.guestPhoneFallback;
}

function minutesPending(draft: PendingDraft): string {
  const minutes = Math.max(0, Math.floor(draft.pendingSinceMs / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours > 1 ? 's' : ''}`;
}

type Props = {
  draft: PendingDraft;
  /**
   * Fires when the operator taps the draft bubble. Routes to the edit screen.
   * Per CLAUDE.md `Pressable inside GestureDetector` gotcha: this Pressable is
   * scoped to the bubble subtree only — swipes anywhere else on the card go
   * straight to the pan gesture. Bubble-originated swipes are an open UAT item.
   */
  onPressDraftBubble?: () => void;
  elevated?: boolean;
  /** Rendered absolutely over the card content, clipped to the card's rounded
   *  corners (e.g. the swipe-direction gradient on the front card). */
  overlay?: ReactNode;
};

const cardOuterClass =
  'overflow-hidden rounded-[20px] border-[0.5px] border-hairline bg-white';

const cardShadow = {
  shadowColor: '#1C1814',
  shadowOpacity: 0.1,
  shadowOffset: { width: 0, height: 8 },
  shadowRadius: 24,
  elevation: 6,
} as const;

export function QueueCard({
  draft,
  onPressDraftBubble,
  elevated = true,
  overlay,
}: Props) {
  const a11yLabel = `Pending draft for ${displayName(draft)}.`;
  const thread = draft.recentContext;
  // A blank draftBody is a real server state (the agent declined to draft, or
  // the row landed before generation finished). Rendering it as an ordinary
  // empty clay bubble with a send affordance is what invited the swipe-right
  // that could never succeed — so blank bodies get placeholder copy, a muted
  // hairline border, and no send glyph.
  //
  // Placeholder wording is fixed by the TAC-309 Contract. It deliberately says
  // nothing about drafts: a draft is our machinery, not the operator's mental
  // model — they never asked for one and don't know one was meant to exist.
  // From their side a guest asked something and it's their turn. Don't
  // "improve" this into app-state language. (TAC-310.)
  const hasDraft = draft.draftBody.trim().length > 0;

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className={cardOuterClass}
      style={[elevated ? cardShadow : null, { maxHeight: queueCard.maxHeightPx }]}
    >
      <View className="flex-row items-center gap-[10px] px-[18px] pb-[14px] pt-[18px]">
        <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 15 }}>
          {displayName(draft)}
        </Text>
        <RecognitionBadge state={draft.recognitionState} />
        <Text
          className="ml-auto font-inter-tight text-ink-faint"
          style={{ fontSize: 11, letterSpacing: 0.44 }}
        >
          {minutesPending(draft)}
        </Text>
      </View>

      <FlaggedBanner
        label={draft.reviewReason}
        detail={draft.agentReasoning}
      />

      <View className="h-[0.5px] bg-hairline" style={{ marginHorizontal: 18 }} />

      <ScrollView style={{ flexShrink: 1 }}>
        {thread.length > 0 ? (
          <View className="flex-col gap-[6px] px-[18px] pb-[6px] pt-[14px]">
            {thread.map((m) => (
              <View
                key={m.id}
                className={
                  m.direction === 'inbound'
                    ? 'self-start rounded-[18px] bg-inbound'
                    : 'self-end rounded-[18px] border-[0.5px] border-hairline bg-paper'
                }
                style={{
                  maxWidth: '86%',
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
          </View>
        ) : null}

        <View
          className="flex-row justify-end"
          style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 14 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasDraft ? 'Edit draft' : 'Write your answer'}
            onPress={onPressDraftBubble}
            disabled={!onPressDraftBubble}
            style={({ pressed }) => ({
              position: 'relative',
              maxWidth: '86%',
              alignSelf: 'flex-end',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              className="bg-white"
              style={{
                borderWidth: 1,
                // clay reads as "ready to send"; blank drafts drop to the
                // hairline token so the bubble stops advertising an action.
                borderColor: hasDraft ? '#C66A4A' : 'rgba(28, 24, 20, 0.12)',
                borderRadius: 20,
                borderBottomRightRadius: 6,
                paddingHorizontal: 16,
                paddingVertical: 12,
                // Room for the send glyph only when there's a glyph to clear.
                paddingRight: hasDraft ? 48 : 16,
              }}
            >
              <Text
                className={
                  hasDraft ? 'font-inter-tight text-ink' : 'font-inter-tight text-ink-faint'
                }
                style={{ fontSize: 14.5, lineHeight: 22 }}
              >
                {hasDraft ? draft.draftBody : 'Type your answer to send to the guest'}
              </Text>
            </View>
            {hasDraft ? (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#C66A4A',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="send" size={14} color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>
        </View>
      </ScrollView>
      {overlay ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {overlay}
        </View>
      ) : null}
    </View>
  );
}

export { displayName as queueCardDisplayName, minutesPending as queueCardMinutesPending };
