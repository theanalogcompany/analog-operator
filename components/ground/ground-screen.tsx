import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { type GroundName } from '@/lib/grounds';
import { ground as groundTheme } from '@/lib/theme';

import { Ground } from './ground';

type Props = {
  name: GroundName;
  children: ReactNode;
  /** Defaults to top/left/right — screens own their own bottom inset, because
   *  the design pins several elements to a derived distance from the home
   *  indicator rather than to the safe area itself. */
  edges?: readonly Edge[];
};

const DEFAULT_EDGES: readonly Edge[] = ['top', 'left', 'right'];

/**
 * The outermost element of every signed-in screen: the ground, the crossfade
 * between grounds, a light status bar, and the safe area.
 *
 * The crossfade is the design's "the screen's ground crossfades to the next
 * card's ground as the deck advances" — implemented as two stacked grounds
 * with an animated opacity, per the handoff's translation note. The outgoing
 * ground stays fully opaque underneath while the incoming one fades in over
 * it, so no frame of the transition shows a seam or a darker composite.
 *
 * Every ground is dark, so the status bar is light everywhere. If the color
 * exercise ever produces a light ground, this is where that stops being true.
 */
export function GroundScreen({ name, children, edges = DEFAULT_EDGES }: Props) {
  const [current, setCurrent] = useState<GroundName>(name);
  const [previous, setPrevious] = useState<GroundName | null>(null);
  const progress = useSharedValue(1);

  // Guards the fade callback against a ground change that lands mid-animation:
  // only the most recent transition is allowed to clear `previous`.
  const transitionId = useRef(0);

  useEffect(() => {
    if (name === current) return;
    const id = transitionId.current + 1;
    transitionId.current = id;
    setPrevious(current);
    setCurrent(name);
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: groundTheme.crossfadeDurationMs },
      (finished) => {
        'worklet';
        if (finished) runOnJS(clearPrevious)(id);
      },
    );
    // `clearPrevious` is declared below and captured per-render; it reads
    // `transitionId` through the ref, so a stale capture is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, current]);

  function clearPrevious(id: number): void {
    if (transitionId.current === id) setPrevious(null);
  }

  const incomingStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View style={{ flex: 1 }}>
      {previous ? <Ground name={previous} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, incomingStyle]}>
        <Ground name={current} />
      </Animated.View>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}
