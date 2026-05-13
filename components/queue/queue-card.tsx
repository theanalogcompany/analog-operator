import { Pressable, Text, View } from 'react-native';

import { type PendingDraft } from '@/lib/api/queue';

import { RecognitionBadge } from './recognition-badge';

function displayName(draft: PendingDraft): string {
  if (draft.guest_name && draft.guest_name.trim().length > 0) return draft.guest_name;
  return draft.guest_phone;
}

function minutesPending(draft: PendingDraft): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(draft.pending_since).getTime()) / 60_000),
  );
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours > 1 ? 's' : ''}`;
}

type Props = {
  draft: PendingDraft;
  expanded: boolean;
  /**
   * Optional tap handler. When set, the card renders a Pressable outer so RN's
   * built-in press recognition fires (used by unit tests). In production the
   * tap comes through the FrontCard's gesture composition, so the queue stack
   * leaves this undefined and the outer renders as a plain View — keeping the
   * native gesture-handler surface unobstructed.
   */
  onToggleExpanded?: () => void;
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

export function QueueCard({ draft, expanded, onToggleExpanded }: Props) {
  const a11yLabel = `Pending draft for ${displayName(draft)}. Tap to ${
    expanded ? 'collapse' : 'expand'
  } context.`;

  const body = (
    <>
      <View className="flex-row items-center gap-[10px] px-[18px] pb-[14px] pt-[18px]">
        <Text className="font-inter-tight-medium text-ink" style={{ fontSize: 15 }}>
          {displayName(draft)}
        </Text>
        <RecognitionBadge band={draft.recognition_band} />
        <Text
          className="ml-auto font-inter-tight text-ink-faint"
          style={{ fontSize: 11, letterSpacing: 0.44 }}
        >
          {minutesPending(draft)}
        </Text>
      </View>

      {draft.flag_reason ? (
        <View
          className="mx-4 mb-[14px] rounded-[4px] border-l-2 border-clay bg-sand"
          style={{ paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <Text className="font-inter-tight text-ink" style={{ fontSize: 13, lineHeight: 20 }}>
            <Text className="font-inter-tight-medium text-clay-deep">Flagged because: </Text>
            {draft.flag_reason}
          </Text>
        </View>
      ) : null}

      <View className="h-[0.5px] bg-hairline" style={{ marginHorizontal: 18 }} />

      <View className="flex-col gap-[6px] px-[18px] pb-[6px] pt-[14px]">
        {expanded
          ? draft.context_messages.map((m) => (
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
            ))
          : null}

        <View
          className="self-start rounded-[18px] bg-inbound"
          style={{
            maxWidth: '86%',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomLeftRadius: 6,
          }}
        >
          <Text
            className="font-inter-tight"
            style={{ color: '#F0EDE7', fontSize: 14, lineHeight: 20 }}
          >
            {draft.current_inbound.body}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-end px-[18px] pb-[18px] pt-[6px]">
        <View
          className="self-end rounded-[18px] border border-clay bg-white"
          style={{
            maxWidth: '86%',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomRightRadius: 6,
          }}
        >
          <Text className="font-inter-tight text-ink" style={{ fontSize: 14.5, lineHeight: 22 }}>
            {draft.agent_draft}
          </Text>
        </View>
      </View>

      {expanded && draft.recognition_signals.length > 0 ? (
        <View className="border-t-[0.5px] border-hairline px-[18px] py-[14px]">
          <Text
            className="font-inter-tight-medium uppercase text-ink-faint"
            style={{ fontSize: 10, letterSpacing: 1.8, marginBottom: 8 }}
          >
            Recognition signals
          </Text>
          {draft.recognition_signals.map((signal, idx) => (
            <Text
              key={`signal-${idx}`}
              className="font-inter-tight text-ink-soft"
              style={{ fontSize: 13, lineHeight: 20 }}
            >
              • {signal}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );

  if (onToggleExpanded) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={onToggleExpanded}
        className={cardOuterClass}
        style={cardShadow}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className={cardOuterClass}
      style={cardShadow}
    >
      {body}
    </View>
  );
}

export { displayName as queueCardDisplayName, minutesPending as queueCardMinutesPending };
