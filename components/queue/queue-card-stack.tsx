import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useHaptics } from '@/hooks/use-haptics';
import { type SwipeDirection, useQueueSwipe } from '@/hooks/use-queue-swipe';
import { type PendingDraft } from '@/lib/api/queue';
import { peekCard, swipeHint } from '@/lib/theme';

import { QueueCard } from './queue-card';
import { SwipeOverlay } from './swipe-overlay';

type FrontCardProps = {
  draft: PendingDraft;
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
};

function FrontCard({ draft, onApprove, onEdit }: FrontCardProps) {
  if (__DEV__) console.log('[render] FrontCard mounted');
  const haptics = useHaptics();

  const handleRight = (): void => {
    haptics.swipeRightSuccess();
    onApprove(draft);
  };
  const handleLeft = (): void => {
    haptics.swipeLeftEdit();
    onEdit(draft);
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
          <QueueCard draft={draft} onPressDraftBubble={() => onEdit(draft)} />
        </Animated.View>
      </GestureDetector>
      <SwipeHints direction={direction} intensity={intensity} />
    </>
  );
}

type PeekCardProps = {
  draft: PendingDraft;
};

function PeekCard({ draft }: PeekCardProps) {
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
        <QueueCard draft={draft} />
      </View>
    </View>
  );
}

type SwipeHintsProps = {
  direction: SharedValue<SwipeDirection>;
  intensity: SharedValue<number>;
};

function SwipeHints({ direction, intensity }: SwipeHintsProps) {
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

  return (
    <View
      className="w-full flex-row justify-between"
      style={{ maxWidth: 354, paddingHorizontal: 8, paddingTop: 12 }}
    >
      <Animated.Text className="font-inter-tight" style={[{ fontSize: 13 }, leftStyle]}>
        ← Swipe left to edit
      </Animated.Text>
      <Animated.Text className="font-inter-tight" style={[{ fontSize: 13 }, rightStyle]}>
        Swipe right to send →
      </Animated.Text>
    </View>
  );
}

type Props = {
  drafts: PendingDraft[];
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
};

export function QueueCardStack({ drafts, onApprove, onEdit }: Props) {
  if (__DEV__) console.log('[render] stack mounted, count:', drafts.length);
  const top = drafts[0];
  const peek = drafts[1];

  if (!top) return null;

  return (
    <View
      className="relative flex-1 items-center overflow-visible"
      style={{ paddingHorizontal: 18, paddingTop: 16 }}
    >
      {peek ? <PeekCard draft={peek} /> : null}
      <FrontCard
        key={top.messageId}
        draft={top}
        onApprove={onApprove}
        onEdit={onEdit}
      />
    </View>
  );
}
