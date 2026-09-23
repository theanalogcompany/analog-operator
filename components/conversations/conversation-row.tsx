import { Pressable, Text, View } from 'react-native';

import { RecognitionBadge } from '@/components/queue/recognition-badge';
import { InstagramGlyph } from '@/components/ui/instagram-glyph';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type ConversationSummary } from '@/lib/api/conversations';
import { guestIdentity } from '@/lib/guest-identity';
import {
  formatConversationTime,
  isConversationActive,
} from '@/lib/conversations-format';
import {
  body as bodyType,
  conversations as conversationsTheme,
  groundText,
  instagramIdentity,
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
  /**
   * One chain for every surface (`lib/guest-identity.ts`). This row used
   * `name ?? phoneFallback`, which renders BLANK for an unnamed Instagram
   * guest: their `phoneFallback` is `''` and `??` does not fall back on an
   * empty string. (TAC-486.)
   */
  const identity = guestIdentity({
    displayName: conversation.name,
    instagramUsername: conversation.instagramUsername,
    phoneFallback: conversation.phoneFallback,
    channel: conversation.guestChannel,
  });
  const displayName = identity.name;
  const isInstagram = conversation.guestChannel === 'instagram';

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
        {/* A handle standing in for a missing name keeps its own case: nobody
            can look up `@LENA.EATS`, and uppercasing someone's handle
            misrepresents it. A real name stays tracked caps like every other
            name in the app. */}
        {identity.nameIsSubstitute && identity.handle ? (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            className="font-inter-tight-medium"
            style={{
              fontSize: typePresets.rowName.size,
              letterSpacing: instagramIdentity.handleAsNameTrackingPx,
              color: '#FFFFFF',
            }}
          >
            {displayName}
          </Text>
        ) : (
          <TrackedCaps {...typePresets.rowName} color="#FFFFFF" decorative>
            {displayName}
          </TrackedCaps>
        )}
        {/* Marks the Instagram rows. Text is the default channel and carries no
            mark, so the glyph means "this one is different" rather than
            labelling every row with its channel.

            DEVIATION from the hand-off, which specifies `#4A4339`: that figure
            is for its white-card Texts list, and this app's list has been
            banded rows of white text on clay since TAC-364. `#4A4339` on clay
            would be all but invisible. The glyph takes the row's own ink
            instead. */}
        {isInstagram ? (
          <InstagramGlyph
            size={instagramIdentity.glyph.rowSizePx}
            color="#FFFFFF"
            decorative
          />
        ) : null}
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
      {conversation.lastMessagePreview === '' ? (
        // No message has reached this guest, so there is no speaker to name.
        // `lastMessageDirection` here comes from an unsent draft (TAC-395
        // Contract, conversations list), so printing "Sana — " would claim
        // someone said something nobody has received. The height is held so
        // the row keeps its two-line rhythm against its banded neighbours.
        // (TAC-411, ruled 2026-09-15.)
        <View
          testID="conversation-row-no-preview"
          style={{ marginTop: 6, height: bodyType.preview.lineHeight }}
        />
      ) : (
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
      )}
    </Pressable>
  );
}
