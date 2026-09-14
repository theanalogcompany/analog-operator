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

import { fadeInAt, ridesEntranceClock } from '@/lib/entrance';
import { useEntrance, useRidesEntranceSlot } from '@/lib/entrance-context';
import { VEIL_BASE_COLOR, type GroundName } from '@/lib/grounds';
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
   * already the ground the entrance should settle on. (TAC-384.)
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
 * while the entrance plays, and bring the card's bucket ground in. A bucket
 * known before the card's 940ms slot rides the boot clock with the card; one
 * that only arrives after it takes the ordinary crossfade from the moment it
 * lands, because nothing can know the colour before the data does. See
 * `entranceGround`.
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
  const { mode, running, clock, reduced, elapsedMs } = useEntrance();
  // `running` says an entrance owns the ground right now; `mode` only says which
  // one. Never gate on `mode` alone — it stays set for the whole process, and a
  // GroundScreen that mounts later (a tab return, a venue switch) is not inside
  // the entrance and must crossfade from its first frame.
  const entranceRunning = running && mode === 'full';
  const baseName = entranceGround ?? name;
  const baseRides = useRidesEntranceSlot(entrance.groundDelayMs);

  // During the entrance the deck starts on the entrance's base, so a ground
  // already known at mount goes through the same handoff decision as one that
  // arrives later.
  const [current, setCurrent] = useState<GroundName>(
    entranceRunning ? baseName : name,
  );
  const [previous, setPrevious] = useState<GroundName | null>(null);
  // A bucket ground that became known before the card's slot, and so rides the
  // boot clock with the card instead of crossfading on arrival.
  const [clockBucket, setClockBucket] = useState<GroundName | null>(null);
  const progress = useSharedValue(1);

  // Guards the fade callback against a ground change that lands mid-animation:
  // only the most recent transition is allowed to clear `previous`.
  const transitionId = useRef(0);

  useEffect(() => {
    if (name === current) return;
    if (
      entranceRunning &&
      ridesEntranceClock({
        elapsedMs: elapsedMs(),
        slotStartMs: entrance.bucketDelayMs,
      })
    ) {
      // Known before the card's slot: hold it for the card. Starting the fade on
      // arrival is the "two ground changes inside the entrance" a fast fetch
      // must never show.
      setPrevious(null);
      setCurrent(name);
      setClockBucket(name === baseName ? null : name);
      progress.value = 1;
      return;
    }
    // Everything else is the ordinary crossfade — including a bucket that only
    // became known after the card's slot. Riding a ramp already under way would
    // mount it nearly opaque over clay, which is a hard cut.
    setClockBucket(null);
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
    // `baseName` and `elapsedMs` are read at the moment of the change, which is
    // the point: the decision belongs to when the ground arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, current, entranceRunning]);

  function clearPrevious(id: number): void {
    if (transitionId.current === id) setPrevious(null);
  }

  const incomingStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  // Clay arriving under the veil.
  const entranceBaseStyle = useAnimatedStyle(() => ({
    opacity: baseRides
      ? fadeInAt({
          elapsedMs: clock.value,
          delayMs: entrance.groundDelayMs,
          durationMs: entrance.groundDurationMs,
        })
      : 1,
  }));

  // The card's bucket ground, over clay, on the card's own clock.
  const entranceBucketStyle = useAnimatedStyle(() => ({
    opacity: fadeInAt({
      elapsedMs: clock.value,
      delayMs: entrance.bucketDelayMs,
      durationMs: groundTheme.crossfadeDurationMs,
    }),
  }));

  // `prefers-reduced-motion`: the entire ground arrives as one short cross-fade
  // and nothing else moves. Pinned at 1 in every other mode, so this wrapper is
  // inert rather than conditional.
  const reducedStyle = useAnimatedStyle(() => ({ opacity: reduced.value }));

  // While the entrance owns the ground, the deck layers only paint once the
  // ground has left the entrance's base by the ordinary route. An empty queue
  // never does, so the entrance resolves straight into "You're all caught up".
  const deckVisible =
    !entranceRunning ||
    previous !== null ||
    (clockBucket === null && current !== baseName);

  return (
    <View style={{ flex: 1 }}>
      {/*
        Near-black under every ground, always. Grounds are opaque, so it only
        shows while one is fading in: the entrance and the reduced-motion fade.
        Without it, what shows through is the navigator's default light grey — a
        pale haze through the middle of the ember, and a white flash under
        reduced motion. Always rather than while `running`, because that flag
        ends on a JS timer and the UI fade can still be finishing. (TAC-384.)
      */}
      <View
        testID="ground-underlay"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: VEIL_BASE_COLOR }]}
      />

      <Animated.View style={[StyleSheet.absoluteFill, reducedStyle]}>
        {entranceRunning ? (
          <Animated.View
            testID="entrance-base"
            style={[StyleSheet.absoluteFill, entranceBaseStyle]}
          >
            <Ground name={baseName} />
          </Animated.View>
        ) : null}
        {entranceRunning && clockBucket ? (
          <Animated.View
            testID="entrance-bucket"
            style={[StyleSheet.absoluteFill, entranceBucketStyle]}
          >
            <Ground name={clockBucket} />
          </Animated.View>
        ) : null}
        {deckVisible ? (
          <>
            {previous ? (
              <View testID="ground-previous" style={StyleSheet.absoluteFill}>
                <Ground name={previous} />
              </View>
            ) : null}
            <Animated.View
              testID="ground-current"
              style={[StyleSheet.absoluteFill, incomingStyle]}
            >
              <Ground name={current} />
            </Animated.View>
          </>
        ) : null}
      </Animated.View>

      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}
