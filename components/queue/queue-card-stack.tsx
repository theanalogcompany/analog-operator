import { useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHaptics } from '@/hooks/use-haptics';
import { useQueueSwipe } from '@/hooks/use-queue-swipe';
import { type PendingDraft } from '@/lib/api/queue';
import { card, layout, peek } from '@/lib/theme';

import { QueueCard } from './queue-card';
import { SwipeHints } from './swipe-hints';
import { SwipeOverlay } from './swipe-overlay';

/**
 * How tall the card gets, and how much room the hint row keeps.
 *
 * The design fixes the card at 560px so every card is the same size no matter
 * how many messages it holds. That is a statement about content, not about
 * devices — 560 plus the top inset, the nav and the 96px hint reserve overflows
 * anything shorter than roughly an iPhone 14.
 *
 * So the degradation is ordered. First the card shrinks, and because region c
 * is the only `flex: 1` inside it, the shrink lands entirely on the
 * conversation: fewer visible messages, still bottom-anchored, head and
 * composer untouched. That is the graceful failure — the operator can always
 * see who it is and what is about to be sent. Below `minHeightPx` the card
 * stops giving and the hint row's reserve gives instead, down to
 * `hintReserveMinPx`. Only once both are spent does the card go under its floor.
 */
export function resolveCardLayout(availableHeight: number): {
  cardHeight: number;
  hintReserve: number;
} {
  const full = card.heightPx;
  const reserve = card.hintReservePx;

  // Pre-measurement (first frame): assume the design's own geometry.
  if (availableHeight <= 0) return { cardHeight: full, hintReserve: reserve };

  const atFullReserve = Math.min(full, availableHeight - reserve);
  if (atFullReserve >= card.minHeightPx) {
    return { cardHeight: atFullReserve, hintReserve: reserve };
  }

  const borrow = Math.min(
    card.minHeightPx - atFullReserve,
    reserve - card.hintReserveMinPx,
  );
  const hintReserve = reserve - borrow;
  return {
    cardHeight: Math.max(0, Math.min(full, availableHeight - hintReserve)),
    hintReserve,
  };
}

/**
 * A peek card's opacity at a given drag intensity. Rendering a pure-white view
 * at opacity `a` is equivalent to filling it `rgba(255,255,255,a)`, and
 * animates on the GPU instead of re-resolving a color every frame.
 */
export function peekOpacity(
  base: number,
  gain: number,
  intensity: number,
): number {
  'worklet';
  const clamped = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  const value = base + gain * clamped;
  return value > 1 ? 1 : value;
}

/**
 * Whether a tap landed on the composer.
 *
 * The composer cannot be a `Pressable`: RN's responder system would claim the
 * touch before gesture-handler could recognize the pan, killing both (CLAUDE.md
 * / TAC-37). So the tap is hoisted into the gesture and hit-tested against the
 * composer's measured top edge — the composer runs to the card's bottom, so one
 * boundary is enough. `-1` means "not measured yet", which must not match.
 */
export function isComposerTap(tapY: number, composerTop: number): boolean {
  'worklet';
  return composerTop >= 0 && tapY >= composerTop;
}

type FrontCardProps = {
  draft: PendingDraft;
  /** The card behind this one, shown in the near peek. */
  next?: PendingDraft;
  cardHeight: number;
  hintReserve: number;
  hintBottom: number;
  position: number;
  total: number;
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
  onRefuseApprove: (draft: PendingDraft) => void;
  onPressHelp: () => void;
};

/**
 * Owns the gesture for exactly one card. Keyed by `messageId` upstream, so the
 * shared values are torn down and recreated when the deck advances — a card
 * that inherited the previous card's `translateX` would render already flown
 * off the screen. (TAC-312.)
 *
 * It also owns the hint row, because the hints read the same shared values.
 * They are pinned to this component's un-padded outer box rather than to the
 * padded centering box, so `bottom` measures from the screen edge as the design
 * intends, not from the inside edge of the hint reserve.
 */
function FrontCard({
  draft,
  next,
  cardHeight,
  hintReserve,
  hintBottom,
  position,
  total,
  onApprove,
  onEdit,
  onRefuseApprove,
  onPressHelp,
}: FrontCardProps) {
  const haptics = useHaptics();

  // A draft with nothing in it can't be sent, so the gesture must not complete.
  // Same predicate the card render uses to choose between the draft body and
  // the placeholder, so what the operator sees and what the swipe allows can't
  // disagree. (TAC-312.)
  const canCommitRight = draft.draftBody.trim().length > 0;

  const composerTop = useSharedValue<number>(-1);

  const openEditor = (): void => {
    haptics.swipeLeftEdit();
    onEdit(draft);
  };

  const { pan, translateX, rotation, direction, intensity } = useQueueSwipe({
    onCommitRight: () => {
      haptics.swipeRightSuccess();
      onApprove(draft);
    },
    onCommitLeft: openEditor,
    onRefuseRight: () => {
      haptics.swipeRefused();
      onRefuseApprove(draft);
    },
    onCrossThreshold: () => {
      haptics.swipeThresholdCrossed();
    },
    canCommitRight,
    enabled: true,
  });

  const tap = Gesture.Tap()
    .maxDuration(300)
    .onEnd((event, success) => {
      'worklet';
      if (!success) return;
      if (isComposerTap(event.y, composerTop.value)) {
        runOnJS(openEditor)();
      }
    });

  // Exclusive, pan first: the pan only activates past a 10px offset, so a
  // stationary tap falls through to the tap recognizer, and a drag never
  // double-fires as both.
  const gesture = Gesture.Exclusive(pan, tap);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: card.screenInsetPx,
          paddingBottom: hintReserve,
        }}
      >
        <View style={{ width: '100%', height: cardHeight }}>
          <PeekSlab depth="far" height={cardHeight} intensity={intensity} />
          <PeekSlab
            depth="near"
            height={cardHeight}
            intensity={intensity}
            draft={next}
          />
          <GestureDetector gesture={gesture}>
            {/* collapsable={false} is mandatory: RN flattens views with no
                native interactable descendant, gesture-handler's ref then
                resolves to nothing, and the pan dies silently while the card
                still renders and every unit test still passes. (TAC-37.) */}
            <Animated.View
              collapsable={false}
              style={[
                { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
                cardStyle,
              ]}
            >
              <QueueCard
                draft={draft}
                height={cardHeight}
                position={position}
                total={total}
                onComposerLayout={(event: LayoutChangeEvent) => {
                  composerTop.value = event.nativeEvent.layout.y;
                }}
                overlay={
                  <SwipeOverlay direction={direction} intensity={intensity} />
                }
              />
            </Animated.View>
          </GestureDetector>
        </View>
      </View>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 20, right: 20, bottom: hintBottom }}
      >
        <SwipeHints
          direction={direction}
          intensity={intensity}
          canSend={canCommitRight}
          onPressHelp={onPressHelp}
        />
      </View>
    </View>
  );
}

type PeekSlabProps = {
  depth: 'near' | 'far';
  height: number;
  intensity: SharedValue<number>;
  /**
   * The next conversation, rendered inside the near slab.
   *
   * The handoff specs both peeks as empty divs carrying only a background
   * alpha, and that is genuinely how the prototype draws them — but it doesn't
   * survive the jump to a real screen. In an iframe you drag a small card and
   * the slab reads as the edge of a paper stack; at full drag on a phone you
   * expose most of a blank white rectangle, which reads as a card that failed
   * to load.
   *
   * So the near slab carries real content while keeping the design's geometry
   * and, importantly, its exact alpha curve: 0.55 at rest rising to 0.9 at full
   * drag. The next card starts as a pale suggestion and resolves as you commit,
   * which is what the brightening was always expressing. The far slab stays
   * blank — at 0.26 any text would be unreadable noise rather than depth.
   */
  draft?: PendingDraft;
};

function PeekSlab({ depth, height, intensity, draft }: PeekSlabProps) {
  const config = peek[depth];
  const base = config.baseOpacity;
  const gain = config.dragGain;

  const style = useAnimatedStyle(() => ({
    opacity: peekOpacity(base, gain, intensity.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      // The peek is scenery. Without this, VoiceOver would read the next
      // guest's conversation aloud as part of the current card.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height,
          borderRadius: card.radiusPx,
          // The card paints its own white; a second layer underneath it only
          // shows at the scaled edges.
          backgroundColor: draft ? 'transparent' : '#FFFFFF',
          zIndex: depth === 'near' ? 2 : 1,
          transform: [
            { translateY: config.translateYPx },
            { scaleX: config.scaleX },
          ],
        },
        style,
      ]}
    >
      {draft ? <QueueCard draft={draft} height={height} /> : null}
    </Animated.View>
  );
}

type Props = {
  drafts: PendingDraft[];
  position: number;
  total: number;
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
  onRefuseApprove: (draft: PendingDraft) => void;
  onPressHelp: () => void;
};

export function QueueCardStack({
  drafts,
  position,
  total,
  onApprove,
  onEdit,
  onRefuseApprove,
  onPressHelp,
}: Props) {
  const insets = useSafeAreaInsets();
  const [availableHeight, setAvailableHeight] = useState(0);
  const { cardHeight, hintReserve } = resolveCardLayout(availableHeight);
  const top = drafts[0];
  const next = drafts[1];

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => setAvailableHeight(event.nativeEvent.layout.height)}
    >
      {top ? (
        <FrontCard
          key={top.messageId}
          draft={top}
          next={next}
          cardHeight={cardHeight}
          hintReserve={hintReserve}
          hintBottom={insets.bottom + layout.hintRowGapPx}
          position={position}
          total={total}
          onApprove={onApprove}
          onEdit={onEdit}
          onRefuseApprove={onRefuseApprove}
          onPressHelp={onPressHelp}
        />
      ) : null}
    </View>
  );
}
