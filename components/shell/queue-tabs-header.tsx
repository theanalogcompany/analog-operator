// Replaces the bare QueueHeader on both /queue and /conversations: same
// hamburger + logo row, plus the segmented Queue/Conversations switcher
// from the imported design. Switches tabs via router.replace (not push) so
// tab-switching never grows the back stack.
//
// `Tab`'s accessibilityLabel is the bare tab name ("Queue", not "Queue 2")
// and the live count renders as its own Text node — required so the
// component's own test suite can target `getByLabelText('Queue')` (exact,
// not "Queue 2") and `getByText('2')` (exact, not embedded in "Queue 2")
// independently. A single combined `label` prop for both accessibilityLabel
// and display text (as in an earlier draft of this component) fails both
// assertions at once — see queue-tabs-header.test.tsx.

import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { useQueueContext } from '@/lib/queue-context';

const LOGO = require('../../assets/images/logo.png');

type Props = {
  onMenuPress: () => void;
};

function Tab({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  const textClassName = active
    ? 'font-inter-tight-medium text-ink'
    : 'font-inter-tight-medium text-ink-faint';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ paddingBottom: 10 }}
    >
      <View className="flex-row items-baseline" style={{ gap: 4 }}>
        <Text className={textClassName} style={{ fontSize: 13 }}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text className={textClassName} style={{ fontSize: 13 }}>
            {count}
          </Text>
        ) : null}
      </View>
      {active ? (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: '#C66A4A',
          }}
        />
      ) : null}
    </Pressable>
  );
}

export function QueueTabsHeader({ onMenuPress }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const queue = useQueueContext();
  const onQueue = pathname.startsWith('/queue');
  const onConversations = pathname.startsWith('/conversations');

  return (
    <View>
      <View className="flex-row items-center justify-between px-[22px] pb-2 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={onMenuPress}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="menu" size={22} color="#1C1814" />
        </Pressable>
        <Image
          source={LOGO}
          accessibilityLabel="Analog"
          resizeMode="contain"
          style={{ width: 34, height: 34 }}
        />
        <View style={{ width: 22 }} />
      </View>
      <View
        className="flex-row border-b-[0.5px] border-hairline-soft px-[22px]"
        style={{ gap: 26, paddingTop: 6 }}
      >
        <Tab
          label="Queue"
          count={queue.drafts.length}
          active={onQueue}
          onPress={() => router.replace('/queue')}
        />
        <Tab label="Conversations" active={onConversations} onPress={() => router.replace('/conversations')} />
      </View>
    </View>
  );
}
