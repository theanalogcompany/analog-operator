import { Text, View } from 'react-native';

import { display, dividerBacking } from '@/lib/theme';

type Props = {
  variant?: 'queue' | 'conversations' | 'thread';
  /**
   * Put the copy on the dividers' scrim so it clears WCAG on a card ground.
   *
   * White at 32px is large text, so the bar is 3:1 — but on Honey it measures
   * 2.62:1 over the frame, and Honey holds 3:1 only to y=420 while the edit
   * takeover's thread area centres well below that. Same problem and same
   * answer as the takeover's date dividers (TAC-364), on their colour and
   * radius rather than a second token. The padding is this line's own: the
   * dividers' 8/3 is sized for 8.5px caps and looks pinched around 32px.
   *
   * Off by default, and specifically NOT set on the Conversations thread:
   * that sits on clay, which clears the bar unbacked, and CLAUDE.md's divider
   * entry already says not to add a pill there for consistency's sake.
   * (TAC-411, SR-1.)
   */
  backed?: boolean;
};

const COPY: Record<
  NonNullable<Props['variant']>,
  { headline: string; body?: string }
> = {
  queue: {
    headline: 'You’re all caught up.',
    body: 'Nothing pending review. Guests are being handled. Take a breath.',
  },
  conversations: {
    headline: 'Nothing here right now.',
    body: "No conversations match that filter. Loosen it and they'll come back.",
  },
  // One line, deliberately. NOT "No messages yet" — that is false in the case
  // that matters: an operator holding a pending card for this guest opens the
  // thread and finds it empty, and "no messages" tells them nothing exists
  // while the card in their hand says otherwise. Messages exist; none has
  // reached the guest. (TAC-411, ruled 2026-09-15.)
  thread: {
    headline: 'Nothing has reached this guest yet.',
  },
};

/** Renders on a ground, so everything here is white. */
export function EmptyState({ variant = 'queue', backed = false }: Props) {
  const copy = COPY[variant];
  const backing = backed
    ? {
        backgroundColor: dividerBacking.color,
        borderRadius: dividerBacking.radiusPx,
        paddingHorizontal: 18,
        paddingVertical: 12,
      }
    : null;
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ gap: 16, paddingHorizontal: 40, paddingBottom: 70 }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#E5B19C',
          marginBottom: 6,
        }}
      />
      <View testID={backed ? 'empty-state-backing' : undefined} style={backing ?? undefined}>
        <Text
          allowFontScaling={false}
          className="font-fraunces"
          style={{
            fontSize: display.emptyTitle.size,
            lineHeight: display.emptyTitle.lineHeight,
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          {copy.headline}
        </Text>
      </View>
      {copy.body ? (
        <Text
          allowFontScaling={false}
          className="font-inter-tight"
          style={{
            fontSize: 13,
            lineHeight: 20,
            color: 'rgba(255,255,255,0.92)',
            textAlign: 'center',
            maxWidth: 250,
          }}
        >
          {copy.body}
        </Text>
      ) : null}
    </View>
  );
}
