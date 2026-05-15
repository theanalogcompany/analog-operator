import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { type PendingDraft } from '@/lib/api/queue';

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

export function QueueCard({ draft }: Props) {
  const a11yLabel = `Pending draft for ${displayName(draft)}.`;

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className={cardOuterClass}
      style={cardShadow}
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

      {draft.reviewReason ? (
        <View
          className="mx-4 mb-[14px] rounded-[4px] border-l-2 border-clay bg-sand"
          style={{ paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <Text className="font-inter-tight text-ink" style={{ fontSize: 13, lineHeight: 20 }}>
            <Text className="font-inter-tight-medium text-clay-deep">Flagged because: </Text>
            {draft.reviewReason}
          </Text>
        </View>
      ) : null}

      <View className="h-[0.5px] bg-hairline" style={{ marginHorizontal: 18 }} />

      <View className="flex-col gap-[6px] px-[18px] pb-[6px] pt-[14px]">
        {draft.recentContext.map((m) => (
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

      <View
        className="flex-row justify-end"
        style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 14 }}
      >
        <View
          style={{
            position: 'relative',
            maxWidth: '86%',
            alignSelf: 'flex-end',
          }}
        >
          <View
            className="bg-white"
            style={{
              borderWidth: 1,
              borderColor: '#C66A4A',
              borderRadius: 20,
              borderBottomRightRadius: 6,
              paddingHorizontal: 16,
              paddingVertical: 12,
              paddingRight: 48,
            }}
          >
            <Text
              className="font-inter-tight text-ink"
              style={{ fontSize: 14.5, lineHeight: 22 }}
            >
              {draft.draftBody}
            </Text>
          </View>
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
        </View>
      </View>
    </View>
  );
}

export { displayName as queueCardDisplayName, minutesPending as queueCardMinutesPending };
