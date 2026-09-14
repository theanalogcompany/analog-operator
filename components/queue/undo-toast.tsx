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
  /**
   * Given the record's venue, the venue's NAME when it isn't the one on
   * screen, and null when it is.
   *
   * The undo window deliberately survives a venue switch (TAC-382), so the
   * toast can outlive the venue it belongs to. Without this it would read
   * "Sent to Maya" over a different venue's queue and, on undo, restore a card
   * the operator never sees come back — correct behavior that looks broken.
   * Passed in rather than read from context so the toast stays mountable on
   * its own.
   */
  crossVenueName?: (venueId: string) => string | null;
};

export function UndoToast({ onUndo, crossVenueName }: Props) {
  const record = useUndoState();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();

  if (!record) return null;

  const elsewhere = crossVenueName?.(record.draft.venueId) ?? null;

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
        allowFontScaling={false}
            className="font-inter-tight"
            style={{ flex: 1, fontSize: 13, color: '#1C1814' }}
          >
            {VERBS[record.action]}
            <Text allowFontScaling={false} style={{ color: '#6F6658' }}>
              {` to ${queueCardDisplayName(record.draft)}`}
              {elsewhere ? ` at ${elsewhere}` : ''}
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
        <DrainBar
          key={record.message_id}
          remainingMs={Math.max(0, record.expires_at - Date.now())}
        />
      </View>
    </View>
  );
}

/**
 * The 2px bar under the row, draining left-to-right over exactly what is left
 * of the dismiss window. It is a clock, not decoration — if it and
 * `record.expires_at` ever disagree, the bar lies about how much time is left.
 *
 * It starts from `remainingMs`, not from full, because the toast can now mount
 * partway through its window: the venue picker lives on the You screen, so
 * switching venues unmounts the queue screen and remounts it with the undo
 * still live (TAC-382). Animating a fresh 3s there would promise runway that
 * does not exist, on the one affordance that takes back a sent message.
 */
function DrainBar({ remainingMs }: { remainingMs: number }) {
  const startFraction = Math.min(
    1,
    Math.max(0, remainingMs / undoToast.windowMs),
  );
  const progress = useSharedValue(startFraction);

  useEffect(() => {
    progress.value = withTiming(0, {
      duration: Math.max(0, remainingMs),
      easing: Easing.linear,
    });
    // `remainingMs` is read once per mount (the component is keyed by
    // messageId); re-running on every render would restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
