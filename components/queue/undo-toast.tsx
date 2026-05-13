import { Pressable, Text, View } from 'react-native';

import { showToast } from '@/components/auth/toast';
import { useHaptics } from '@/hooks/use-haptics';
import {
  type UndoRecord,
  clearUndoState,
  useUndoState,
} from '@/hooks/use-undo-state';

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
      className="absolute bottom-12 left-4 right-4"
    >
      <View className="flex-row items-center justify-between rounded-xl bg-ink px-4 py-3">
        <Text
          className="font-inter-tight text-paper"
          style={{ fontSize: 15, lineHeight: 20 }}
        >
          {VERBS[record.action]}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo"
          onPress={handleUndo}
          hitSlop={12}
        >
          <Text
            className="font-inter-tight-medium uppercase text-clay-soft"
            style={{ fontSize: 12, letterSpacing: 1.92, fontWeight: '600' }}
          >
            Undo
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
