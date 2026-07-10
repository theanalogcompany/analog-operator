import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { useHaptics } from '@/hooks/use-haptics';
import { type SwipeDirection, useQueueSwipe } from '@/hooks/use-queue-swipe';
import { type PendingDraft } from '@/lib/api/queue';
import { swipeHint } from '@/lib/theme';

import { QueueCard } from './queue-card';
import { SwipeOverlay } from './swipe-overlay';

type FrontCardProps = {
  draft: PendingDraft;
  peek?: PendingDraft;
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
};

function FrontCard({ draft, peek, onApprove, onEdit }: FrontCardProps) {
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

  const frontHeight = useSharedValue(0);
  const peekHeight = useSharedValue(0);

  return (
    <>
      <View className="w-full" style={{ maxWidth: 354, position: 'relative' }}>
        {peek ? (
          <PeekCard draft={peek} intensity={intensity} heightValue={peekHeight} />
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View
            collapsable={false}
            className="w-full"
            style={[{ zIndex: 3 }, cardStyle]}
            onLayout={(e) => {
              frontHeight.value = e.nativeEvent.layout.height;
            }}
          >
            <QueueCard
              draft={draft}
              onPressDraftBubble={() => onEdit(draft)}
              overlay={<SwipeOverlay direction={direction} intensity={intensity} />}
            />
          </Animated.View>
        </GestureDetector>
      </View>
      <SwipeHints
        direction={direction}
        intensity={intensity}
        frontHeight={frontHeight}
        peekHeight={peekHeight}
      />
    </>
  );
}

type PeekCardProps = {
  draft: PendingDraft;
  intensity: SharedValue<number>;
  heightValue: SharedValue<number>;
};

function PeekCard({ draft, intensity, heightValue }: PeekCardProps) {
  const revealStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intensity.value, [0, 0.02], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(e) => {
        heightValue.value = e.nativeEvent.layout.height;
      }}
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
        revealStyle,
      ]}
    >
      <QueueCard draft={draft} elevated={false} />
    </Animated.View>
  );
}

type SwipeHintsProps = {
  direction: SharedValue<SwipeDirection>;
  intensity: SharedValue<number>;
  frontHeight: SharedValue<number>;
  peekHeight: SharedValue<number>;
};

function SwipeHints({
  direction,
  intensity,
  frontHeight,
  peekHeight,
}: SwipeHintsProps) {
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

  // When the next card is taller than the front, slide the hints down by the
  // height difference as the swipe progresses, so they land under the taller
  // next card instead of being stranded in its middle.
  const containerStyle = useAnimatedStyle(() => {
    const extra = Math.max(0, peekHeight.value - frontHeight.value);
    return {
      transform: [
        {
          translateY: interpolate(
            intensity.value,
            [0, 1],
            [0, extra],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View
      className="w-full flex-row justify-between"
      style={[
        { maxWidth: 354, paddingHorizontal: 8, paddingTop: 20, paddingBottom: 10, zIndex: 10 },
        containerStyle,
      ]}
    >
      <Animated.Text className="font-inter-tight" style={[{ fontSize: 13 }, leftStyle]}>
        ← Swipe left to edit
      </Animated.Text>
      <Animated.Text className="font-inter-tight" style={[{ fontSize: 13 }, rightStyle]}>
        Swipe right to send →
      </Animated.Text>
    </Animated.View>
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
      <FrontCard
        key={top.messageId}
        draft={top}
        peek={peek}
        onApprove={onApprove}
        onEdit={onEdit}
      />
    </View>
  );
}
