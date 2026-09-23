import { type LayoutChangeEvent, Text, View } from 'react-native';

import { HandleLink } from '@/components/ui/handle-link';
import { InstagramGlyph } from '@/components/ui/instagram-glyph';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type RecognitionState } from '@/lib/api/queue';
import { type GuestIdentity } from '@/lib/guest-identity';
import { type ReplyWindowState } from '@/lib/reply-window';
import { instagramIdentity, replyWindow, typePresets } from '@/lib/theme';

import { RecognitionBadge } from './recognition-badge';
import { ReplyWindowPill } from './reply-window-pill';

type Props = {
  identity: GuestIdentity;
  recognitionState: RecognitionState | null;
  window: ReplyWindowState;
  expired: boolean;
  /** What a text card shows where an Instagram card shows its timer. */
  elapsedLabel: string;
  /**
   * Reports the handle link's frame so the card stack can hit-test a tap
   * against it. Only passed on a LIVE card, where the link cannot be a real
   * `Pressable`; see `HandleLink`'s `mode`.
   */
  onHandleLayout?: (event: LayoutChangeEvent) => void;
  /** Passed instead on a card with no `GestureDetector` above it. */
  onPressHandle?: () => void;
};

/** The 32px initial avatar. Instagram gives us no photo we can cache. */
function Avatar({ initial, expired }: { initial: string; expired: boolean }) {
  return (
    <View
      testID="guest-avatar"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: instagramIdentity.avatarSizePx,
        height: instagramIdentity.avatarSizePx,
        borderRadius: instagramIdentity.avatarSizePx / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: expired
          ? replyWindow.expired.avatarBg
          : instagramIdentity.avatarBg,
      }}
    >
      <Text
        allowFontScaling={false}
        className="font-inter-tight-medium"
        style={{
          fontSize: 12,
          letterSpacing: 0.6,
          color: instagramIdentity.avatarInk,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

/**
 * The name line.
 *
 * A real name is tracked caps, like every other name in the app. A handle
 * standing in for one is NOT: it keeps its own case and its own tracking,
 * because `@MIA.BREWS` is not a thing anyone can look up, and uppercasing
 * someone's handle misrepresents it.
 */
function NameLine({ identity, ink }: { identity: GuestIdentity; ink: string }) {
  if (identity.nameIsSubstitute && identity.handle) {
    return (
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        className="font-inter-tight-medium"
        style={{
          fontSize: typePresets.cardName.size,
          letterSpacing: instagramIdentity.handleAsNameTrackingPx,
          color: ink,
        }}
      >
        {identity.name}
      </Text>
    );
  }
  return (
    <TrackedCaps {...typePresets.cardName} color={ink} numberOfLines={1}>
      {identity.name}
    </TrackedCaps>
  );
}

/**
 * The card's head: who this is, and how long there is to answer them.
 *
 * Two shapes, chosen by channel. A TEXT card is exactly what it has always
 * been — name, badge, elapsed time on one row — because the hand-off's binding
 * constraint is that text cards do not change. An INSTAGRAM card gains the
 * avatar, the handle line and the glyph, and swaps elapsed time for the
 * reply-window timer. (TAC-486, B2.)
 */
export function CardHead({
  identity,
  recognitionState,
  window,
  expired,
  elapsedLabel,
  onHandleLayout,
  onPressHandle,
}: Props) {
  const metaInk = expired ? replyWindow.expired.metaInk : '#6F6658';
  const nameInk = expired ? replyWindow.expired.metaInk : '#1C1814';

  const timer =
    window.kind === 'none' || window.kind === 'unknown' ? (
      <TrackedCaps {...typePresets.elapsed} color={metaInk}>
        {elapsedLabel}
      </TrackedCaps>
    ) : (
      <ReplyWindowPill state={window} />
    );

  if (identity.channel !== 'instagram') {
    // Unchanged from what ships today.
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TrackedCaps {...typePresets.cardName} color={nameInk}>
          {identity.name}
        </TrackedCaps>
        <RecognitionBadge state={recognitionState} variant="card" />
        <View style={{ marginLeft: 'auto' }}>{timer}</View>
      </View>
    );
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <Avatar initial={identity.initial} expired={expired} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <NameLine identity={identity} ink={nameInk} />
          {/* Not repeated when the handle is already the name line. */}
          {identity.handle && !identity.nameIsSubstitute ? (
            <View style={{ marginTop: 3 }}>
              <HandleLink
                handle={identity.handle}
                ink={metaInk}
                underlineColor={
                  expired
                    ? replyWindow.expired.chipBorder
                    : instagramIdentity.handle.underline
                }
                mode={onPressHandle ? 'button' : 'hoisted'}
                onPress={onPressHandle}
                onLayout={onHandleLayout}
              />
            </View>
          ) : null}
        </View>
        {timer}
      </View>

      {/* The glyph REPLACES the rectangular channel chip. Indented past the
          avatar so it lines up under the name rather than under the avatar. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          marginTop: 12,
          paddingLeft: instagramIdentity.avatarSizePx + 11,
        }}
      >
        <InstagramGlyph
          size={instagramIdentity.glyph.cardSizePx}
          color={metaInk}
        />
        <RecognitionBadge state={recognitionState} variant="card" />
      </View>
    </View>
  );
}
