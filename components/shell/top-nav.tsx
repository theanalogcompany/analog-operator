import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { useNotificationPermission } from '@/hooks/use-notification-permission';
import { fadeInAt } from '@/lib/entrance';
import { useEntrance, useRidesEntranceSlot } from '@/lib/entrance-context';
import { useQueueContext } from '@/lib/queue-context';
import { entrance, nav, typePresets } from '@/lib/theme';

type TabKey = 'queue' | 'texts' | 'you';

/**
 * The signed-in top navigation.
 *
 * THE COLUMN WIDTHS ARE LOAD-BEARING. Left is `flex: 1` start-aligned, middle
 * is `flex: none`, right is `flex: 1` end-aligned. That, and only that, centers
 * "Texts" on the screen — and so under the dynamic island — no matter how wide
 * "Queue 12" gets. `justifyContent: 'space-between'` looks equivalent and is
 * not: it centers the middle item between its neighbours, which drifts right as
 * the queue count grows. Do not "simplify" this into space-between.
 */
export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const queue = useQueueContext();
  const permission = useNotificationPermission();
  const { clock } = useEntrance();
  const navRides = useRidesEntranceSlot(entrance.navDelayMs);

  // The Texts tab stays active while a thread is open.
  const active: TabKey = pathname.startsWith('/you')
    ? 'you'
    : pathname.startsWith('/conversations')
      ? 'texts'
      : 'queue';

  // The nav arrives just after the card, on the boot clock; a constant 1
  // outside a cold launch. (TAC-384.)
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: navRides
      ? fadeInAt({
          elapsedMs: clock.value,
          delayMs: entrance.navDelayMs,
          durationMs: entrance.navDurationMs,
        })
      : 1,
  }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'baseline',
          borderBottomWidth: 1,
          borderBottomColor: nav.hairlineColor,
          paddingTop: nav.topInsetPx,
          paddingHorizontal: nav.horizontalInsetPx,
        },
        entranceStyle,
      ]}
    >
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Tab
          label="Queue"
          count={queue.drafts.length + queue.commitments.length}
          active={active === 'queue'}
          onPress={() => router.replace('/queue')}
        />
      </View>
      <View style={{ flex: 0 }}>
        <Tab
          label="Texts"
          active={active === 'texts'}
          onPress={() => router.replace('/conversations')}
        />
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Tab
          label="You"
          active={active === 'you'}
          // An operator who can't be notified needs to know without a banner
          // eating the top of the queue. The dot is the whole signal; the row
          // that explains it lives on the You screen.
          dot={permission === 'denied'}
          onPress={() => router.replace('/you')}
        />
      </View>
    </Animated.View>
  );
}

type TabProps = {
  label: string;
  count?: number;
  active: boolean;
  dot?: boolean;
  onPress: () => void;
};

function Tab({ label, count, active, dot = false, onPress }: TabProps) {
  const color = active ? nav.activeColor : nav.inactiveColor;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      // Bare tab name, so `getByLabelText('Queue')` stays exact. The count is
      // additive via accessibilityValue rather than baked into the label —
      // an explicit label replaces an element's entire announced content, so
      // folding it in would drop the count from VoiceOver entirely.
      accessibilityLabel={label}
      accessibilityValue={
        count !== undefined ? { text: `${count} pending` } : undefined
      }
      accessibilityHint={dot ? 'Push notifications are off' : undefined}
      onPress={onPress}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        paddingBottom: nav.tabPaddingBottomPx,
        // Sits the tab's own underline exactly on the row's hairline.
        marginBottom: -1,
        borderBottomWidth: 1,
        borderBottomColor: active ? nav.activeColor : 'transparent',
      }}
    >
      <TrackedCaps {...typePresets.navTab} color={color} decorative>
        {label}
      </TrackedCaps>
      {count !== undefined ? (
        <TrackedCaps {...typePresets.navCount} color={color} decorative>
          {String(count)}
        </TrackedCaps>
      ) : null}
      {dot ? (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 5,
            backgroundColor: '#E5B19C',
            alignSelf: 'center',
          }}
        />
      ) : null}
    </Pressable>
  );
}
