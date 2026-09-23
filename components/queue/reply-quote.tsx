import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type ReplyingTo } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { type ThreadItem } from '@/lib/thread-cluster';
import { body as bodyType, dividerBacking, groundText, typePresets } from '@/lib/theme';

/**
 * The guest message a draft is answering, quoted directly above the composer.
 * (TAC-533. Ruled 2026-09-23: option 3 of the three the ticket costed.)
 *
 * Why this exists: since TAC-397 gave each unanswered question its own card, a
 * guest with several pending cards sees the same tail of recent messages under
 * every one of them, so every card but the newest reads as answering the wrong
 * question. On device: a draft reading "yeah, any drink" sat directly beneath
 * an unrelated question about Sunday opening hours.
 *
 * Two constraints from the ruling shape what follows.
 *
 * 1. THE ROW CAN NEVER GROW. The card is fixed-height with only the thread
 *    flexing (`queue-card.tsx`, regions b/c/d), so every point this row takes
 *    is a point of conversation. The label and the quote sit INLINE on one line
 *    and the quote is `numberOfLines={1}`, which pins the row at one line
 *    height whatever the guest wrote. The alternative laid the label above the
 *    quote, matching the replaced-draft block exactly, and cost ~46px against
 *    ~32px; the head block is a different region of the card, so that visual
 *    rhyme was buying less than it cost.
 *
 * 2. IT DOES NOT REPLACE THE THREAD. The later messages still render in real
 *    order, unchanged. This row names which one is being answered; it hides
 *    nothing. That is why it is a quote and not a scroll anchor.
 */
export function ReplyQuote({
  replyingTo,
  lastRenderedMessageId,
  surface,
  metaInk,
  style,
}: {
  replyingTo: ReplyingTo | null;
  /** See `shouldShowReplyQuote`. */
  lastRenderedMessageId: string | null;
  /**
   * `card` — the white card surface, where the row takes the replaced-draft
   * block's left rule and dark ink.
   * `takeover` — the edit screen, where the row sits on the card's GROUND. See
   * the backing note below.
   */
  surface: 'card' | 'takeover';
  /** The card surface's muted ink for the label; the expired card dims it. */
  metaInk?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (!shouldShowReplyQuote(replyingTo, lastRenderedMessageId)) return null;

  const onGround = surface === 'takeover';

  return (
    <View style={style}>
      <View
        testID="reply-quote"
        style={
          onGround
            ? {
                // On the takeover this sits directly on the card's ground, where
                // the label is white 8.5px tracked caps — the exact case
                // `dividerBacking` was computed for, and the exact case that
                // misses 4.5:1 unbacked (Honey falls to 2.45:1). Same colour and
                // alpha as the date dividers beside it, but gated by its OWN
                // case in `__tests__/lib/ground-contrast.test.ts` ("the edit
                // takeover reply-quote row"), which also pins that the backing
                // is load-bearing here. Leaning on the divider case would mean
                // losing the gate silently the day dividers change.
                // (TAC-364, TAC-411, TAC-533.)
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                maxWidth: '100%',
                backgroundColor: dividerBacking.color,
                borderRadius: dividerBacking.radiusPx,
                paddingHorizontal: dividerBacking.paddingHorizontalPx + 2,
                paddingVertical: dividerBacking.paddingVerticalPx,
              }
            : {
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 11,
                borderLeftWidth: 1,
                borderLeftColor: 'rgba(28,24,20,0.22)',
              }
        }
      >
        <TrackedCaps
          {...typePresets.amendLabel}
          color={onGround ? groundText.body : (metaInk ?? '#6F6658')}
          decorative
        >
          {CARD_COPY.replyingTo}
        </TrackedCaps>
        <Text
          allowFontScaling={false}
          // The label rides on the quote itself rather than on the wrapper: a
          // View carrying an accessibilityLabel without `accessible` is not
          // reliably one focusable node, and the caps label beside it is
          // already `decorative`, so nothing announces twice. It restores the
          // words the one-line clip takes away, which is the whole reason the
          // row is safe to truncate.
          accessibilityLabel={`${CARD_COPY.replyingTo}: ${replyingTo.body}`}
          className="font-inter-tight"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            flexShrink: 1,
            marginLeft: 8,
            fontSize: bodyType.preview.size,
            lineHeight: bodyType.preview.lineHeight,
            color: onGround ? groundText.body : '#4A4339',
          }}
        >
          {replyingTo.body}
        </Text>
      </View>
    </View>
  );
}

/**
 * Whether the quote says anything the thread does not already.
 *
 * Withheld when the message the draft answers is the last one already rendered
 * above the composer, which is the ordinary single-card case: the question is
 * the bubble the operator is looking at, and quoting it would be a second copy
 * of the same words in the same eyeful. That is what makes TAC-533's third
 * acceptance criterion literally true rather than approximately — a card whose
 * draft answers the newest message is a zero-pixel diff — and what keeps the
 * row honest about the card's density, which Jaipal has flagged: it appears
 * only on the cards that actually have the problem.
 *
 * Pure and exported so the decision is testable without rendering either
 * surface, per the TAC-312 rule about testing the layer that holds the
 * behaviour rather than a layer that merely calls it.
 */
export function shouldShowReplyQuote(
  replyingTo: ReplyingTo | null,
  lastRenderedMessageId: string | null,
): replyingTo is ReplyingTo {
  if (!replyingTo) return false;
  return replyingTo.messageId !== lastRenderedMessageId;
}

/**
 * The id of the last message a thread actually renders, which is what
 * `shouldShowReplyQuote` compares against.
 *
 * Reads the rendered item list rather than the source messages, because that
 * list is what the operator can see, and it skips back over day separators:
 * both surfaces end on a bubble in practice, but a separator is not a message
 * and must never be mistaken for one.
 */
export function lastRenderedMessageId(items: ThreadItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.kind === 'bubble') return item.message.id;
  }
  return null;
}
