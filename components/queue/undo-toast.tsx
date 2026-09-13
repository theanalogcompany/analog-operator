import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { useHaptics } from '@/hooks/use-haptics';
import {
  type UndoRecord,
  clearUndoState,
  useUndoState,
} from '@/hooks/use-undo-state';
import { queueCardDisplayName } from '@/components/queue/queue-card';
import { layout, typePresets, undoToast } from '@/lib/theme';

const VERBS: Record<UndoRecord['action'], string> = {
  approve: 'Sent',
  edit: 'Sent your version',
  skip: 'Dismissed',
};

type Props = {
  onUndo: (record: UndoRecord) => void;
};

export function UndoToast({ onUndo }: Props) {
  const record = useUndoState();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();

  if (!record) return null;

  const handleUndo = (): void => {
    haptics.undoTriggered();
    onUndo(record);
    void clearUndoState();
    showToast('Marked as undone');
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 20,
        right: 20,
        bottom: insets.bottom + layout.toastGapPx,
      }}
    >
      <View
        style={{
          backgroundColor: '#FBF8F2',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0px 16px 38px rgba(20,17,14,0.34)',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 18,
            paddingVertical: 15,
          }}
        >
          <Text
            className="font-inter-tight"
            style={{ flex: 1, fontSize: 13, color: '#1C1814' }}
          >
            {VERBS[record.action]}
            <Text style={{ color: '#6F6658' }}>
              {` to ${queueCardDisplayName(record.draft)}`}
            </Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            onPress={handleUndo}
            hitSlop={12}
          >
            <TrackedCaps {...typePresets.undoAction} color="#A85638" decorative>
              Undo
            </TrackedCaps>
          </Pressable>
        </View>
        {/* Keyed by messageId so a second action restarts the bar from full
            rather than resuming a partly-drained one from the last card. */}
        <DrainBar key={record.message_id} />
      </View>
    </View>
  );
}

/**
 * The 2px bar under the row, draining left-to-right over exactly the dismiss
 * window. It is a clock, not decoration — if its duration and
 * `undoToast.windowMs` ever disagree, the bar lies about how much time is left.
 */
function DrainBar() {
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(0, {
      duration: undoToast.drainDurationMs,
      easing: Easing.linear,
    });
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View
      style={{
        height: undoToast.drainHeightPx,
        backgroundColor: 'rgba(28,24,20,0.10)',
      }}
    >
      <Animated.View
        style={[
          {
            height: undoToast.drainHeightPx,
            backgroundColor: '#A85638',
            // scaleX shrinks toward the left edge rather than the centre.
            transformOrigin: 'left',
          },
          fillStyle,
        ]}
      />
    </View>
  );
}
