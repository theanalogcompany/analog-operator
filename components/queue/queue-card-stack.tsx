import { useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle } from 'react-native-reanimated';

import { useHaptics } from '@/hooks/use-haptics';
import { useQueueSwipe } from '@/hooks/use-queue-swipe';
import { type PendingDraft } from '@/lib/api/queue';
import { peekCard } from '@/lib/theme';

import { QueueCard } from './queue-card';
import { SwipeOverlay } from './swipe-overlay';

type FrontCardProps = {
  draft: PendingDraft;
  onApprove: (draft: PendingDraft) => void;
  onEdit: (draft: PendingDraft) => void;
};

function FrontCard({ draft, onApprove, onEdit }: FrontCardProps) {
  if (__DEV__) console.log('[render] FrontCard mounted');
  const [expanded, setExpanded] = useState(false);
  const haptics = useHaptics();

  const handleRight = (): void => {
    haptics.swipeRightSuccess();
    onApprove(draft);
  };
  const handleLeft = (): void => {
    haptics.swipeLeftEdit();
    onEdit(draft);
  };
  const toggleExpanded = (): void => {
    setExpanded((v) => !v);
  };

  const { pan, translateX, rotation, direction, intensity } = useQueueSwipe({
    onCommitRight: handleRight,
    onCommitLeft: handleLeft,
    enabled: true,
  });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(10)
    .onEnd((_event, success) => {
      'worklet';
      if (__DEV__) console.log('[tap] end', { success });
      if (success) runOnJS(toggleExpanded)();
    });

  const composed = Gesture.Exclusive(pan, tap);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <>
      <SwipeOverlay direction={direction} intensity={intensity} />
      <GestureDetector gesture={composed}>
        <Animated.View
          collapsable={false}
          className="w-full"
          style={[{ maxWidth: 354, zIndex: 3 }, cardStyle]}
        >
          <QueueCard draft={draft} expanded={expanded} />
        </Animated.View>
      </GestureDetector>
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
        <QueueCard draft={draft} expanded={false} />
      </View>
    </View>
  );
}

function SwipeHints() {
  return (
    <View
      className="w-full flex-row justify-between"
      style={{ maxWidth: 354, paddingHorizontal: 8, paddingTop: 12 }}
    >
      <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 11 }}>
        ← Swipe left to edit
      </Text>
      <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 11 }}>
        Swipe right to send →
      </Text>
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
        key={top.id}
        draft={top}
        onApprove={onApprove}
        onEdit={onEdit}
      />
      <SwipeHints />
    </View>
  );
}
