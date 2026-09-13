import { Pressable, Text, View } from 'react-native';

import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type ConversationSummary } from '@/lib/api/conversations';
import {
  formatConversationTime,
  isConversationActive,
} from '@/lib/conversations-format';
import {
  body as bodyType,
  conversations as conversationsTheme,
  groundText,
  typePresets,
} from '@/lib/theme';

type Props = {
  conversation: ConversationSummary;
  onPress: () => void;
  /** Even rows carry a translucent band, odd rows none. The alternation
   *  replaces the old white card frame and the section headers the redesign
   *  drops — the filters do that job now. */
  banded: boolean;
};

export function ConversationRow({ conversation, onPress, banded }: Props) {
  const active = isConversationActive(
    conversation.lastMessageAt,
    conversationsTheme.activeWindowMins,
  );
  const speaker =
    conversation.lastMessageDirection === 'inbound'
      ? 'Guest'
      : conversation.agentName;
  const displayName = conversation.name ?? conversation.phoneFallback;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${displayName}`}
      onPress={onPress}
      // Object form, NOT `({ pressed }) => ...`. The function form is dropped
      // on device, which took the band, the 13px padding and the row's whole
      // rhythm with it — rows merged into one column and the activity dot sat
      // flush against the screen edge. Cause unknown, does not reproduce in
      // Jest. See the CLAUDE.md gotcha before changing this back.
      style={{
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: banded ? 'rgba(255,255,255,0.12)' : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 5,
            backgroundColor: active ? '#E5B19C' : 'rgba(255,255,255,0.32)',
          }}
        />
        <TrackedCaps {...typePresets.rowName} color="#FFFFFF" decorative>
          {displayName}
        </TrackedCaps>
        <RecognitionBadge
          state={conversation.recognitionState}
          variant="ground"
        />
        <TrackedCaps
          {...typePresets.rowTime}
          color="rgba(255,255,255,0.78)"
          decorative
          style={{ marginLeft: 'auto' }}
        >
          {formatConversationTime(conversation.lastMessageAt)}
        </TrackedCaps>
      </View>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        className="font-inter-tight"
        style={{
          // Aligns under the name rather than under the activity dot.
          marginTop: 6,
          paddingLeft: 14,
          fontSize: bodyType.preview.size,
          lineHeight: bodyType.preview.lineHeight,
          color: groundText.body,
        }}
      >
        {`${speaker} — ${conversation.lastMessagePreview}`}
      </Text>
    </Pressable>
  );
}
