import { Text, View } from 'react-native';

import { type ThreadItem } from '@/lib/thread-cluster';

type Props = {
  items: ThreadItem[];
};

export function ThreadBubbleList({ items }: Props) {
  return (
    <>
      {items.map((item) => {
        if (item.kind === 'timestamp') {
          return (
            <View key={item.key} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text
                className="font-inter-tight uppercase text-ink-faint"
                style={{ fontSize: 10, letterSpacing: 1.5 }}
              >
                {item.label}
              </Text>
            </View>
          );
        }
        const { message: m, position } = item;
        // Tail corner only on 'only' and 'last' — chained bubbles
        // ('first', 'middle') get full 18px on both bottom corners so
        // they read as a continuous chain.
        const hasTail = position === 'only' || position === 'last';
        const inbound = m.direction === 'inbound';
        return (
          <View
            key={item.key}
            className={
              inbound
                ? 'self-start rounded-[18px] bg-inbound'
                : 'self-end rounded-[18px] border-[0.5px] border-hairline bg-paper'
            }
            style={{
              maxWidth: '80%',
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginTop: position === 'first' || position === 'only' ? 4 : 0,
              borderBottomLeftRadius: inbound && hasTail ? 6 : 18,
              borderBottomRightRadius: !inbound && hasTail ? 6 : 18,
            }}
          >
            <Text
              className="font-inter-tight"
              style={{
                color: inbound ? '#F0EDE7' : '#1C1814',
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {m.body}
            </Text>
          </View>
        );
      })}
    </>
  );
}
