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

import { fadeInAt } from '@/lib/entrance';
import { useEntrance } from '@/lib/entrance-context';
import { type GroundName } from '@/lib/grounds';
import { entrance, ground as groundTheme } from '@/lib/theme';

import { Ground } from './ground';

type Props = {
  name: GroundName;
  children: ReactNode;
  /** Defaults to top/left/right — screens own their own bottom inset, because
   *  the design pins several elements to a derived distance from the home
   *  indicator rather than to the safe area itself. */
  edges?: readonly Edge[];
  /**
   * The ground the cold-launch entrance resolves into, when it differs from
   * `name`.
   *
   * Must be CONSTANT across the fetch. The queue screen passes clay
   * unconditionally, so the clay phase of the entrance is the same whether the
   * queue returns in 300ms or 2s. Pass nothing on a screen whose `name` is
   * already the ground the entrance should settle on (the sign-in flow), and
   * the entrance simply fades that in with no second layer. (TAC-384.)
   */
  entranceGround?: GroundName;
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
 * During a cold-launch entrance this component has a second job: hold clay
 * while the entrance plays, and bring the card's bucket ground in on the boot
 * clock rather than on the response. See `entranceGround`.
 *
 * Every ground is dark, so the status bar is light everywhere. If the color
 * exercise ever produces a light ground, this is where that stops being true.
 */
export function GroundScreen({
  name,
  children,
  edges = DEFAULT_EDGES,
  entranceGround,
}: Props) {
  const { running: entranceRunning, clock, reduced } = useEntrance();

  const [current, setCurrent] = useState<GroundName>(name);
  const [previous, setPrevious] = useState<GroundName | null>(null);
  const progress = useSharedValue(1);

  // The entrance owns the ground only while the PROVIDER says it is playing —
  // never while `mode === 'full'`, which stays true for the whole process. A
  // GroundScreen that mounts after the entrance (a tab return, a venue switch,
  // the queue reached by signing in) takes the ordinary crossfade from its first
  // frame. When `running` flips, `current` is already `name` and the bucket
  // layer is fully opaque, so the handoff paints the same pixels.

  // Guards the fade callback against a ground change that lands mid-animation:
  // only the most recent transition is allowed to clear `previous`.
  const transitionId = useRef(0);

  useEffect(() => {
    if (name === current) return;
    if (entranceRunning) {
      // Sync without animating. The bucket arrives on the boot clock; letting
      // the deck crossfade also fire here is what would produce the "two ground
      // changes inside the entrance" a fast fetch must never show.
      setPrevious(null);
      setCurrent(name);
      progress.value = 1;
      return;
    }
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
  }, [name, current, entranceRunning]);

  function clearPrevious(id: number): void {
    if (transitionId.current === id) setPrevious(null);
  }

  const incomingStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  // Clay arriving under the veil. Pinned at 1 outside an entrance.
  const entranceBaseStyle = useAnimatedStyle(() => ({
    opacity: fadeInAt({
      elapsedMs: clock.value,
      delayMs: entrance.groundDelayMs,
      durationMs: entrance.groundDurationMs,
    }),
  }));

  // The card's bucket ground, over clay, on the card's own clock.
  const entranceBucketStyle = useAnimatedStyle(() => ({
    opacity: fadeInAt({
      elapsedMs: clock.value,
      delayMs: entrance.bucketDelayMs,
      durationMs: entrance.bucketDurationMs,
    }),
  }));

  // `prefers-reduced-motion`: the entire ground arrives as one short cross-fade
  // and nothing else moves. Pinned at 1 in every other mode, so this wrapper is
  // inert rather than conditional.
  const reducedStyle = useAnimatedStyle(() => ({ opacity: reduced.value }));

  const baseName = entranceGround ?? name;
  // No bucket when the screen's ground IS the entrance ground — which is the
  // empty queue. An empty deck has no card, so there is nothing for the ground
  // to become and the entrance resolves straight into "You're all caught up".
  const bucketName = entranceRunning && name !== baseName ? name : null;

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, reducedStyle]}>
        {entranceRunning ? (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, entranceBaseStyle]}>
              <Ground name={baseName} />
            </Animated.View>
            {bucketName ? (
              <Animated.View
                style={[StyleSheet.absoluteFill, entranceBucketStyle]}
              >
                <Ground name={bucketName} />
              </Animated.View>
            ) : null}
          </>
        ) : (
          <>
            {previous ? <Ground name={previous} /> : null}
            <Animated.View style={[StyleSheet.absoluteFill, incomingStyle]}>
              <Ground name={current} />
            </Animated.View>
          </>
        )}
      </Animated.View>

      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}
