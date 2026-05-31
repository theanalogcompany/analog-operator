import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useHaptics } from '@/hooks/use-haptics';
import { type SwipeDirection, useQueueSwipe } from '@/hooks/use-queue-swipe';
import { type HeadsUpCommitment } from '@/lib/api/commitments';
import { type PendingDraft } from '@/lib/api/queue';
import { type QueueCard, cardKey } from '@/lib/queue/cards';
import { peekCard, swipeHint } from '@/lib/theme';

import { HeadsUpCard } from './heads-up-card';
import { QueueCard as DraftQueueCard } from './queue-card';
import { SwipeOverlay } from './swipe-overlay';

type DraftHandlers = {
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
};

type HeadsUpHandlers = {
  onAcknowledge: (commitment: HeadsUpCommitment) => void;
  onDecline: (commitment: HeadsUpCommitment) => void;
};

type FrontCardProps = {
  card: QueueCard;
  draftHandlers: DraftHandlers;
  headsUpHandlers: HeadsUpHandlers;
};

function FrontCard({ card, draftHandlers, headsUpHandlers }: FrontCardProps) {
  if (__DEV__) console.log('[render] FrontCard mounted', card.type);
  const haptics = useHaptics();

  // Branch swipe routing by card.type. This is the spot the CRITICAL no-send
  // guard tests against: swipe-right on a heads-up card MUST hit
  // `onAcknowledge`, never the draft `onApprove` path; swipe-left on a
  // heads-up card MUST hit `onDecline` (which calls draft-decline, persists
  // pending — no send), never the draft `onEdit` path. The handler shape
  // makes the wrong wiring impossible to compile. (TAC-298.)
  const handleRight = (): void => {
    haptics.swipeRightSuccess();
    if (card.type === 'draft_review') {
      draftHandlers.onApprove(card.draft);
    } else {
      headsUpHandlers.onAcknowledge(card.commitment);
    }
  };
  const handleLeft = (): void => {
    haptics.swipeLeftEdit();
    if (card.type === 'draft_review') {
      draftHandlers.onEdit(card.draft);
    } else {
      headsUpHandlers.onDecline(card.commitment);
    }
  };

  const { pan, translateX, rotation, direction, intensity } = useQueueSwipe({
    onCommitRight: handleRight,
    onCommitLeft: handleLeft,
    enabled: true,
  });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <>
      <SwipeOverlay direction={direction} intensity={intensity} />
      <GestureDetector gesture={pan}>
        <Animated.View
          collapsable={false}
          className="w-full"
          style={[{ maxWidth: 354, zIndex: 3 }, cardStyle]}
        >
          {card.type === 'draft_review' ? (
            <DraftQueueCard
              draft={card.draft}
              onPressDraftBubble={() => draftHandlers.onEdit(card.draft)}
            />
          ) : (
            <HeadsUpCard commitment={card.commitment} />
          )}
        </Animated.View>
      </GestureDetector>
      <SwipeHints direction={direction} intensity={intensity} cardType={card.type} />
    </>
  );
}

type PeekCardProps = {
  card: QueueCard;
};

function PeekCard({ card }: PeekCardProps) {
  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 items-center"
      style={{
        top: peekCard.topOffsetPx,
        opacity: peekCard.opacity,
        zIndex: 2,
      }}
    >
      <View
        style={{
          maxWidth: 354,
          width: '100%',
          transform: [{ scale: peekCard.scale }],
          transformOrigin: 'top center',
        }}
      >
        {card.type === 'draft_review' ? (
          <DraftQueueCard draft={card.draft} />
        ) : (
          <HeadsUpCard commitment={card.commitment} />
        )}
      </View>
    </View>
  );
}

type SwipeHintsProps = {
  direction: SharedValue<SwipeDirection>;
  intensity: SharedValue<number>;
  cardType: QueueCard['type'];
};

function SwipeHints({ direction, intensity, cardType }: SwipeHintsProps) {
  const leftStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      direction.value === -1 ? intensity.value : 0,
      [0, 1],
      [swipeHint.restColor, swipeHint.editColor],
    ),
  }));
  const rightStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      direction.value === 1 ? intensity.value : 0,
      [0, 1],
      [swipeHint.restColor, swipeHint.sendColor],
    ),
  }));

  const leftLabel =
    cardType === 'draft_review' ? '← Swipe left to edit' : '← Swipe left to decline';
  const rightLabel =
    cardType === 'draft_review' ? 'Swipe right to send →' : 'Swipe right to acknowledge →';

  return (
    <View
      className="w-full flex-row justify-between"
      style={{ maxWidth: 354, paddingHorizontal: 8, paddingTop: 12 }}
    >
      <Animated.Text className="font-inter-tight" style={[{ fontSize: 13 }, leftStyle]}>
        {leftLabel}
      </Animated.Text>
      <Animated.Text className="font-inter-tight" style={[{ fontSize: 13 }, rightStyle]}>
        {rightLabel}
      </Animated.Text>
    </View>
  );
}

type Props = {
  cards: QueueCard[];
  draftHandlers: DraftHandlers;
  headsUpHandlers: HeadsUpHandlers;
};

export function QueueCardStack({ cards, draftHandlers, headsUpHandlers }: Props) {
  if (__DEV__) console.log('[render] stack mounted, count:', cards.length);
  const top = cards[0];
  const peek = cards[1];

  if (!top) return null;

  return (
    <View
      className="relative flex-1 items-center overflow-visible"
      style={{ paddingHorizontal: 18, paddingTop: 16 }}
    >
      {peek ? <PeekCard card={peek} /> : null}
      <FrontCard
        key={cardKey(top)}
        card={top}
        draftHandlers={draftHandlers}
        headsUpHandlers={headsUpHandlers}
      />
    </View>
  );
}
