import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  measure,
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommitmentThread } from '@/hooks/use-commitment-thread';
import { useHaptics } from '@/hooks/use-haptics';
import { useNow } from '@/hooks/use-now';
import { type SwipeOutcome, useQueueSwipe } from '@/hooks/use-queue-swipe';
import { type HeadsUpCommitment, type PendingDraft } from '@/lib/api/queue';
import { windowState } from '@/lib/reply-window';
import { cardRiseAt, fadeInAt } from '@/lib/entrance';
import { useEntrance, useRidesEntranceSlot } from '@/lib/entrance-context';
import {
  type QueueItem,
  canCommitRightFor,
  swipeActionFor,
} from '@/lib/queue-items';
import { subQueuePositionFor } from '@/lib/sub-queue';
import {
  card,
  entrance,
  instagramIdentity,
  layout,
  peek,
  swipe,
} from '@/lib/theme';

import { HeadsUpCard } from './heads-up-card';
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

/** A rectangle, in whatever space the caller measured it. */
export type TapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Whether a tap landed on the handle link, within `hitSlop` of it.
 *
 * The handle cannot be a `Pressable` on a live card for the same reason the
 * composer cannot: RN's responder system would claim the touch before
 * gesture-handler could recognise the pan, killing both (CLAUDE.md, TAC-37).
 * So the tap is hoisted into the gesture and hit-tested here.
 *
 * **Both arguments must be in the SAME coordinate space, and the caller picks
 * page coordinates.** The first version of this compared an `onLayout` rect
 * against the gesture's card-local `event.x/y`, and `onLayout` reports
 * coordinates relative to the IMMEDIATE PARENT — the handle sits three levels
 * inside the head, so its rect came back at roughly (0, 0). The real handle
 * never matched, and a tap in the card's top-left corner, on the flag strip,
 * opened Instagram. `isComposerTap` gets away with a card-local `y` only
 * because the composer happens to be a direct child of the card's inner
 * column; this is not the same treatment, and pretending it was is what hid
 * the defect. The caller now measures on the UI thread (`measure()`, page
 * coordinates) and passes the gesture's `absoluteX/absoluteY`.
 *
 * Unlike the composer this needs a full rectangle: the composer runs to the
 * card's bottom edge so one boundary is enough, while the handle is a short run
 * of text in the middle of the head with the timer pill beside it.
 *
 * The slop matters. The handle is about 16pt tall, well under the 44pt Apple
 * asks for, and the real `Pressable` on the other two surfaces gets the same
 * slop from RN.
 */
export function isHandleTap(
  tapX: number,
  tapY: number,
  rect: TapRect,
  hitSlop: number,
): boolean {
  'worklet';
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    tapX >= rect.x - hitSlop &&
    tapX <= rect.x + rect.width + hitSlop &&
    tapY >= rect.y - hitSlop &&
    tapY <= rect.y + rect.height + hitSlop
  );
}

type CardActions = {
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
  onRefuseApprove: (draft: PendingDraft) => void;
  /** Heads-up swipe-right. Sends nothing. */
  onAcknowledge: (commitment: HeadsUpCommitment) => void;
  /** Heads-up swipe-left. Starts a decline draft; sends nothing itself. */
  onDecline: (commitment: HeadsUpCommitment) => void;
  onPressHelp: () => void;
  /** The expired card's one action: copy the draft, open the guest's thread. */
  onCopyAndOpen: (draft: PendingDraft) => void;
  /**
   * The handle link. Opens the guest's Instagram thread and NOTHING else.
   *
   * Deliberately not the same action as the copy button: an operator tapping a
   * handle is looking at who this is, and silently replacing their clipboard
   * would be a side effect they did not ask for and would not see.
   */
  onOpenHandle: (draft: PendingDraft) => void;
  /**
   * A swipe was in flight when the reply window shut under it. Owes the
   * operator the one line explaining why the card stopped accepting the
   * gesture. (Ruled 2026-09-23.)
   */
  onBlockedExpired: () => void;
};

type FrontCardProps = CardActions & {
  item: QueueItem;
  /** The whole deck, so a card can tell where it sits among its guest's. */
  items: readonly QueueItem[];
  /** The card behind this one, shown in the near peek. */
  next?: QueueItem;
  cardHeight: number;
  hintReserve: number;
  hintBottom: number;
  position: number;
  total: number;
  /** While this card's decline is being written the gesture is off, so a
   *  second swipe can't start a second decline. */
  busy: boolean;
};

/**
 * Owns the gesture for exactly one card. Keyed by the item's key upstream, so the
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
  item,
  items,
  next,
  cardHeight,
  hintReserve,
  hintBottom,
  position,
  total,
  busy,
  onApprove,
  onEdit,
  onRefuseApprove,
  onAcknowledge,
  onDecline,
  onPressHelp,
  onCopyAndOpen,
  onOpenHandle,
  onBlockedExpired,
}: FrontCardProps) {
  const haptics = useHaptics();

  // The same clock and the same pure function the card renders from, so what
  // the operator sees and what the gesture allows cannot disagree about
  // whether the window is shut.
  const subQueueSpot = subQueuePositionFor(items, item);
  const nowMs = useNow();
  const expired =
    item.kind === 'draft' &&
    windowState({
      expiresAt: item.draft.replyWindowExpiresAt,
      channel: item.draft.guestChannel,
      nowMs,
    }).kind === 'closed';

  // A draft with nothing in it can't be sent, so the gesture must not complete.
  // Same predicate the card render uses to choose between the draft body and
  // the placeholder, so what the operator sees and what the swipe allows can't
  // disagree. (TAC-312.) A heads-up card can always be acknowledged, and an
  // expired card can commit nothing in either direction.
  const canCommitRight = canCommitRightFor(item, { expired });

  const composerTop = useSharedValue<number>(-1);
  const handleRef = useAnimatedRef<View>();

  // Every finished swipe resolves through `swipeActionFor`, the one place that
  // decides what a gesture does to each kind of card. There is deliberately no
  // shortcut from a gesture callback straight to `onApprove`: a heads-up card
  // shares this chassis, and a swipe-right routed like a draft's would send a
  // real message to a guest. (TAC-364.)
  const dispatch = (outcome: SwipeOutcome): void => {
    const action = swipeActionFor(item, outcome, { expired });
    switch (action.type) {
      case 'blocked-expired':
        haptics.swipeRefused();
        onBlockedExpired();
        return;
      case 'approve':
        haptics.swipeRightSuccess();
        onApprove(action.draft);
        return;
      case 'edit':
        haptics.swipeLeftEdit();
        onEdit(action.draft);
        return;
      case 'refuse-approve':
        haptics.swipeRefused();
        onRefuseApprove(action.draft);
        return;
      case 'acknowledge':
        haptics.swipeRightSuccess();
        onAcknowledge(action.commitment);
        return;
      case 'decline':
        haptics.swipeLeftEdit();
        onDecline(action.commitment);
        return;
      case 'none':
        return;
    }
  };

  // Only a draft has a composer to tap. A heads-up card never reports a
  // composer frame, so the hit-test below can't match, but the kind check means
  // a stray tap can never reach `onDecline` either: a tap is not a decline.
  const openEditor = (): void => {
    if (item.kind === 'draft') dispatch('left');
  };

  const openHandle = (): void => {
    if (item.kind === 'draft') onOpenHandle(item.draft);
  };

  const { pan, translateX, rotation, direction, intensity, isPanning } = useQueueSwipe({
    onCommitRight: () => dispatch('right'),
    onCommitLeft: () => dispatch('left'),
    onRefuseRight: () => dispatch('refuse-right'),
    onCrossThreshold: () => {
      haptics.swipeThresholdCrossed();
    },
    canCommitRight,
    // Off entirely once the window has shut. The expired card is also rendered
    // outside the GestureDetector below, so this is belt and braces rather
    // than the only guard.
    enabled: !busy && !expired,
  });

  /**
   * The window shutting under the operator's hands.
   *
   * Ruled 2026-09-23: the card converts the moment it expires, even mid-read,
   * and a gesture in flight when it crosses is cancelled and explained. The
   * conversion itself is just the re-render; this is the explanation, and it
   * fires ONLY when a finger was actually down. A card that expires while
   * nobody is touching it owes nothing, because nobody tried anything.
   *
   * The shared values are reset here too: a pan abandoned at 60px would
   * otherwise leave the expired card sitting off-centre, since `FrontCard` is
   * keyed by the item and does not remount when the window state changes.
   */
  useEffect(() => {
    if (!expired) return;
    const wasPanning = isPanning.value;
    isPanning.value = false;
    translateX.value = 0;
    rotation.value = swipe.residualRotationDeg;
    direction.value = 0;
    intensity.value = 0;
    if (wasPanning) onBlockedExpired();
    // `onBlockedExpired` is intentionally not a dependency: this fires on the
    // transition into expiry, not whenever the screen hands down a new closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, isPanning, translateX, rotation, direction, intensity]);

  const { clock: entranceClock } = useEntrance();
  const riseRides = useRidesEntranceSlot(entrance.cardDelayMs);
  const thread = useCommitmentThread(
    item.kind === 'headsUp' ? item.commitment.sourceMessageId : null,
    item.kind === 'headsUp',
  );

  const tap = Gesture.Tap()
    .maxDuration(300)
    .onEnd((event, success) => {
      'worklet';
      if (!success) return;
      // The handle is tested FIRST: it sits inside the head, which the
      // composer's single-boundary test does not cover, and a tap can only
      // mean one thing.
      const handle = measure(handleRef);
      if (
        handle !== null &&
        isHandleTap(
          event.absoluteX,
          event.absoluteY,
          {
            x: handle.pageX,
            y: handle.pageY,
            width: handle.width,
            height: handle.height,
          },
          instagramIdentity.handle.hitSlopPx,
        )
      ) {
        runOnJS(openHandle)();
        return;
      }
      if (isComposerTap(event.y, composerTop.value)) {
        runOnJS(openEditor)();
      }
    });

  // Exclusive, pan first: the pan only activates past a 10px offset, so a
  // stationary tap falls through to the tap recognizer, and a drag never
  // double-fires as both.
  const gesture = Gesture.Exclusive(pan, tap);

  // The card's rise: opacity and offset from ONE ramp on the boot clock. A card
  // that mounts after its slot has begun — a queue that landed late, the next
  // card after a swipe — appears in place instead. (TAC-384.)
  const cardStyle = useAnimatedStyle(() => {
    const rise = riseRides
      ? cardRiseAt({
          elapsedMs: entranceClock.value,
          delayMs: entrance.cardDelayMs,
          durationMs: entrance.cardDurationMs,
          fromPx: entrance.cardRiseFromPx,
        })
      : { opacity: 1, translateY: 0 };
    return {
      opacity: rise.opacity,
      transform: [
        // An expired card never carries a swipe offset. It cannot be dragged,
        // and a card left transformed by a pan that was cancelled mid-flight
        // would sit crooked with nothing able to straighten it.
        { translateX: expired ? 0 : translateX.value },
        { translateY: rise.translateY },
        { rotate: expired ? '0deg' : `${rotation.value}deg` },
      ],
    };
  });

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
            item={next}
          />
          {/* An EXPIRED card is rendered outside the GestureDetector
              entirely, not inside a disabled one.

              That is the only arrangement that gives its copy button a real
              `Pressable`: a Pressable inside a GestureDetector wins RN's
              responder race and kills both the pan and any tap composed with it
              (CLAUDE.md, TAC-37). It also makes "this card cannot be swiped"
              structural rather than a flag someone can flip: with no detector
              in the tree there is no gesture to accidentally re-enable.

              No SwipeOverlay either — the washes exist to preview a swipe, and
              there is no swipe to preview. */}
          {expired && item.kind === 'draft' ? (
            <Animated.View
              testID="queue-front-card"
              collapsable={false}
              style={[
                { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
                cardStyle,
              ]}
            >
              <QueueCard
                draft={item.draft}
                height={cardHeight}
                position={position}
                total={total}
                onCopyAndOpen={() => onCopyAndOpen(item.draft)}
                // No GestureDetector above this card, so the handle can be a
                // real Pressable rather than a hoisted hit-test.
                onPressHandle={() => onOpenHandle(item.draft)}
                subQueueSpot={subQueueSpot}
              />
            </Animated.View>
          ) : (
          <GestureDetector gesture={gesture}>
            {/* collapsable={false} is mandatory: RN flattens views with no
                native interactable descendant, gesture-handler's ref then
                resolves to nothing, and the pan dies silently while the card
                still renders and every unit test still passes. (TAC-37.) */}
            <Animated.View
              testID="queue-front-card"
              collapsable={false}
              style={[
                { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
                cardStyle,
              ]}
            >
              {item.kind === 'draft' ? (
                <QueueCard
                  draft={item.draft}
                  height={cardHeight}
                  position={position}
                  total={total}
                  onComposerLayout={(event: LayoutChangeEvent) => {
                    composerTop.value = event.nativeEvent.layout.y;
                  }}
                  handleRef={handleRef}
                  subQueueSpot={subQueueSpot}
                  overlay={
                    <SwipeOverlay direction={direction} intensity={intensity} />
                  }
                />
              ) : (
                <HeadsUpCard
                  commitment={item.commitment}
                  height={cardHeight}
                  thread={thread}
                  position={position}
                  total={total}
                  overlay={
                    <SwipeOverlay direction={direction} intensity={intensity} />
                  }
                />
              )}
            </Animated.View>
          </GestureDetector>
          )}
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
          kind={expired ? 'expired' : item.kind}
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
  item?: QueueItem;
};

function PeekSlab({ depth, height, intensity, item }: PeekSlabProps) {
  const config = peek[depth];
  const base = config.baseOpacity;
  const gain = config.dragGain;

  const { clock: entranceClock } = useEntrance();
  // The slabs arrive behind the card, near first. Two separate offsets rather
  // than one shared delay: the 60ms between them is what makes the deck read as
  // having depth instead of appearing as a single block.
  const entranceDelayMs =
    depth === 'near' ? entrance.peekNearDelayMs : entrance.peekFarDelayMs;
  const entranceDurationMs =
    depth === 'near' ? entrance.peekNearDurationMs : entrance.peekFarDurationMs;
  const slabRides = useRidesEntranceSlot(entranceDelayMs);

  // The drag opacity and the entrance opacity multiply: the slab's alpha curve
  // through a swipe is unchanged, it is simply scaled by how far the entrance
  // has brought the slab in. Outside a cold launch, or for a slab that mounted
  // after its slot, the second factor is 1.
  const style = useAnimatedStyle(() => ({
    opacity:
      peekOpacity(base, gain, intensity.value) *
      (slabRides
        ? fadeInAt({
            elapsedMs: entranceClock.value,
            delayMs: entranceDelayMs,
            durationMs: entranceDurationMs,
          })
        : 1),
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
          backgroundColor: item ? 'transparent' : '#FFFFFF',
          zIndex: depth === 'near' ? 2 : 1,
          transform: [
            { translateY: config.translateYPx },
            { scaleX: config.scaleX },
          ],
        },
        style,
      ]}
    >
      {item?.kind === 'draft' ? (
        <QueueCard draft={item.draft} height={height} />
      ) : item?.kind === 'headsUp' ? (
        <HeadsUpCard commitment={item.commitment} height={height} />
      ) : null}
    </Animated.View>
  );
}

type Props = CardActions & {
  items: QueueItem[];
  position: number;
  total: number;
  /** Key of the card whose decline is being written, if any. */
  busyKey?: string | null;
};

export function QueueCardStack({
  items,
  position,
  total,
  busyKey = null,
  ...actions
}: Props) {
  const insets = useSafeAreaInsets();
  const [availableHeight, setAvailableHeight] = useState(0);
  const { cardHeight, hintReserve } = resolveCardLayout(availableHeight);
  const top = items[0];
  const next = items[1];

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => setAvailableHeight(event.nativeEvent.layout.height)}
    >
      {top ? (
        <FrontCard
          key={top.key}
          item={top}
          items={items}
          next={next}
          cardHeight={cardHeight}
          hintReserve={hintReserve}
          hintBottom={insets.bottom + layout.hintRowGapPx}
          position={position}
          total={total}
          busy={busyKey === top.key}
          {...actions}
        />
      ) : null}
    </View>
  );
}
