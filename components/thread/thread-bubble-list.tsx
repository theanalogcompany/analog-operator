import { View } from 'react-native';

import { MessageBubble, type BubbleSurface } from '@/components/ui/message-bubble';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type ThreadItem } from '@/lib/thread-cluster';
import { dividerBacking, groundText, typePresets } from '@/lib/theme';

type Props = {
  items: ThreadItem[];
  /**
   * `card` — the edit takeover, where outgoing bubbles keep their hairline.
   * `thread` — the read-only text thread, where they don't: there's no white
   * surface behind them to separate from.
   */
  surface?: BubbleSurface;
  /** Divider colour. Both surfaces sit on a ground, so this is white by
   *  default; the queue card passes its own darker value. */
  dividerColor?: string;
};

export function ThreadBubbleList({
  items,
  surface = 'thread',
  dividerColor = groundText.body,
}: Props) {
  return (
    <>
      {items.map((item) => {
        if (item.kind === 'timestamp') {
          const label = (
            <TrackedCaps {...typePresets.dateDivider} color={dividerColor}>
              {item.label}
            </TrackedCaps>
          );
          return (
            <View
              key={item.key}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              {surface === 'card' ? (
                // On the takeover the divider sits on a card ground, where white
                // alone misses 4.5:1. See `dividerBacking` in lib/theme.ts.
                <View
                  testID="thread-divider-backing"
                  style={{
                    backgroundColor: dividerBacking.color,
                    borderRadius: dividerBacking.radiusPx,
                    paddingHorizontal: dividerBacking.paddingHorizontalPx,
                    paddingVertical: dividerBacking.paddingVerticalPx,
                  }}
                >
                  {label}
                </View>
              ) : (
                label
              )}
            </View>
          );
        }
        const { message, position } = item;
        // Tail corner only on 'only' and 'last' — chained bubbles keep the
        // full radius on both bottom corners so they read as one utterance.
        const chained = !(position === 'only' || position === 'last');
        return (
          <MessageBubble
            key={item.key}
            direction={message.direction}
            body={message.body}
            surface={surface}
            chained={chained}
          />
        );
      })}
    </>
  );
}
