import { Text, View } from 'react-native';

import { body as bodyType, card, replyWindow } from '@/lib/theme';

export type BubbleSurface = 'card' | 'thread' | 'expiredCard';

type Props = {
  direction: 'inbound' | 'outbound';
  body: string;
  /**
   * `card` — the queue card and the edit takeover: outgoing bubbles carry a
   * hairline border so they read against the card's white fill.
   * `thread` — the read-only text thread: outgoing bubbles have no border,
   * because there is no white surface behind them to separate from.
   * `expiredCard` — the queue card once its Instagram reply window has shut.
   * The card stays white, so the bubbles keep their border and lose a little
   * warmth: this conversation is no longer live from here. (TAC-486, A4.)
   */
  surface?: BubbleSurface;
  /** Square off the tail corner, for chained same-direction bubbles. */
  chained?: boolean;
};

const TAIL_RADIUS = 5;
const RADIUS = 18;

export function MessageBubble({
  direction,
  body,
  surface = 'card',
  chained = false,
}: Props) {
  const inbound = direction === 'inbound';
  const showTail = !chained;
  const expired = surface === 'expiredCard';
  // An outgoing bubble needs its hairline wherever it sits on a white card, so
  // the border follows the surface being a CARD rather than being live.
  const onCard = surface === 'card' || expired;

  const fill = expired
    ? inbound
      ? replyWindow.expired.inboundBubble
      : replyWindow.expired.outboundBubble
    : inbound
      ? '#E3DCCE'
      : '#FFFFFF';

  return (
    <View
      style={{
        alignSelf: inbound ? 'flex-start' : 'flex-end',
        maxWidth: `${card.bubbleMaxWidthPct}%`,
        backgroundColor: fill,
        borderWidth: !inbound && onCard ? 1 : 0,
        borderColor: expired
          ? replyWindow.expired.outboundBorder
          : 'rgba(28,24,20,0.14)',
        borderRadius: RADIUS,
        borderBottomLeftRadius: inbound && showTail ? TAIL_RADIUS : RADIUS,
        borderBottomRightRadius: !inbound && showTail ? TAIL_RADIUS : RADIUS,
        paddingHorizontal: 13,
        paddingVertical: 9,
      }}
    >
      <Text
        allowFontScaling={false}
        className="font-inter-tight"
        style={{
          color: inbound ? '#1C1814' : '#4A4339',
          fontSize: bodyType.bubble.size,
          lineHeight: bodyType.bubble.lineHeight,
        }}
      >
        {body}
      </Text>
    </View>
  );
}
