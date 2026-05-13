import { useState } from 'react';
import { Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

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
          className="w-full"
          style={[{ maxWidth: 354, zIndex: 3 }, cardStyle]}
        >
          <QueueCard
            draft={draft}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
          />
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
        style={{ maxWidth: 354, width: '100%', transform: [{ scale: peekCard.scale }] }}
      >
        <QueueCard draft={draft} expanded={false} onToggleExpanded={() => {}} />
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

