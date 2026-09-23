import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { CARD_COPY } from '@/lib/card-copy';
import { instagramIdentity } from '@/lib/theme';

/** The up-right arrow: the one thing on a card that leaves the app. */
function LeaveArrow({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 17 17 7M8 7h9v9"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type Props = {
  /** Already carrying its `@`. */
  handle: string;
  ink: string;
  underlineColor: string;
  /**
   * **`button`** renders a real `Pressable`. Only safe where no
   * `GestureDetector` is an ancestor: the Texts thread header, and the expired
   * queue card (which is deliberately rendered outside the detector).
   *
   * **`hoisted`** renders an inert view that reports its frame instead, for a
   * LIVE queue card. A `Pressable` there would win RN's responder race and kill
   * both the pan and the tap composed with it (CLAUDE.md, TAC-37), so the tap
   * is hoisted into the card stack's gesture and hit-tested against this frame
   * — the same treatment the composer already gets. That is also what satisfies
   * the hand-off's two-part requirement: a tap on the handle must not start a
   * swipe, and a drag that starts on the handle must still swipe the card.
   *
   * There is no default. Getting this wrong kills the swipe on every card, and
   * the failure is silent: the component renders, the tests pass, and no touch
   * registers on device.
   */
  mode: 'button' | 'hoisted';
  /** `button` only. */
  onPress?: () => void;
  /** `hoisted` only: the frame the stack hit-tests, in card-local coordinates. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * The guest's Instagram handle, as a link out of the app (TAC-486, B2 and B4).
 *
 * A hairline underline and a small arrow, because it is the one thing on the
 * card that leaves: everything else acts on the card in front of the operator.
 */
export function HandleLink({
  handle,
  ink,
  underlineColor,
  mode,
  onPress,
  onLayout,
}: Props) {
  const label = CARD_COPY.replyWindow.openInInstagram.replace('{handle}', handle);

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: instagramIdentity.handle.gapPx,
        alignSelf: 'flex-start',
        paddingBottom: 1,
        borderBottomWidth: 1,
        borderBottomColor: underlineColor,
      }}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        className="font-inter-tight"
        style={{
          fontSize: instagramIdentity.handle.sizePx,
          letterSpacing: instagramIdentity.handle.trackingPx,
          color: ink,
        }}
      >
        {handle}
      </Text>
      <LeaveArrow size={instagramIdentity.handle.arrowSizePx} color={ink} />
    </View>
  );

  if (mode === 'hoisted') {
    return (
      <View
        testID="handle-link"
        onLayout={onLayout}
        // Inert. The tap lives in the card stack's gesture; this only has to be
        // measurable and readable.
        accessible
        accessibilityRole="link"
        accessibilityLabel={label}
        style={{ alignSelf: 'flex-start' }}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID="handle-link"
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={instagramIdentity.handle.hitSlopPx}
      // Object form for the structure; the function form is dropped on device
      // (CLAUDE.md). Press feedback is the one thing the function form is for,
      // and a missing dim costs nothing.
      style={{ alignSelf: 'flex-start' }}
    >
      {({ pressed }) => (
        <View style={{ opacity: pressed ? instagramIdentity.handle.pressedOpacity : 1 }}>
          {content}
        </View>
      )}
    </Pressable>
  );
}
