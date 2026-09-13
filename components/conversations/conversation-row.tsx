import { Pressable, Text, View } from 'react-native';

import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { type ConversationSummary } from '@/lib/api/conversations';
import { formatConversationTime, isConversationActive } from '@/lib/conversations-format';
import { conversations as conversationsTheme } from '@/lib/theme';

type Props = {
  conversation: ConversationSummary;
  onPress: () => void;
  isFirst: boolean;
};

export function ConversationRow({ conversation, onPress, isFirst }: Props) {
  const active = isConversationActive(
    conversation.lastMessageAt,
    conversationsTheme.activeWindowMins,
  );
  const speaker =
    conversation.lastMessageDirection === 'inbound' ? 'Guest' : conversation.agentName;
  const displayName = conversation.name ?? conversation.phoneFallback;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${displayName}`}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 8,
        borderTopWidth: isFirst ? 0 : 0.5,
        borderTopColor: 'rgba(28, 24, 20, 0.06)',
        opacity: pressed ? 0.7 : active ? 1 : 0.62,
      })}
    >
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 6,
            backgroundColor: active ? '#C66A4A' : 'transparent',
            borderWidth: active ? 0 : 1,
            borderColor: 'rgba(28, 24, 20, 0.2)',
          }}
        />
        <Text
          className="font-inter-tight-medium text-ink"
          style={{ fontSize: 15, lineHeight: 20 }}
        >
          {displayName}
        </Text>
        <RecognitionBadge state={conversation.recognitionState} />
        <Text
          className="ml-auto font-inter-tight text-ink-faint"
          style={{ fontSize: 11, letterSpacing: 0.44 }}
        >
          {formatConversationTime(conversation.lastMessageAt)}
        </Text>
      </View>
      <Text
        className="font-inter-tight text-ink-soft"
        numberOfLines={1}
        style={{ fontSize: 13, lineHeight: 21 }}
      >
        <Text className="text-ink-faint">{speaker} · </Text>
        {conversation.lastMessagePreview}
      </Text>
    </Pressable>
  );
}
