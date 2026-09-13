import { Modal, Pressable, Text, View } from 'react-native';

import { type RecognitionState } from '@/lib/api/queue';
import { recognition } from '@/lib/theme';

export type TypeFilterOption = 'all' | RecognitionState;

const OPTIONS: { value: TypeFilterOption; label: string }[] = [
  { value: 'all', label: 'All guests' },
  { value: 'new', label: recognition.stateLabels.new },
  { value: 'returning', label: recognition.stateLabels.returning },
  { value: 'regular', label: recognition.stateLabels.regular },
  { value: 'raving_fan', label: recognition.stateLabels.raving_fan },
];

type Props = {
  visible: boolean;
  selected: TypeFilterOption;
  counts: Record<TypeFilterOption, number>;
  onSelect: (option: TypeFilterOption) => void;
  onDismiss: () => void;
  /** Distance from the top of the screen to the panel, measured from the
   *  trigger pill so the menu hangs off the control that opened it. */
  top: number;
};

/**
 * The anchored type filter. A white panel on a scrim — the one place in the
 * signed-in app that isn't on a ground, because it's a menu rather than a
 * surface.
 */
export function TypeFilterMenu({
  visible,
  selected,
  counts,
  onSelect,
  onDismiss,
  top,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss filter menu"
        onPress={onDismiss}
        style={{ flex: 1, backgroundColor: 'rgba(20,17,14,0.28)' }}
      >
        <View
          // Stops a tap inside the panel from reaching the dismiss scrim.
          onStartShouldSetResponder={() => true}
          style={{
            position: 'absolute',
            top,
            left: 22,
            minWidth: 196,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 6,
            boxShadow: '0px 18px 44px rgba(20,17,14,0.34)',
          }}
        >
          {OPTIONS.map((option) => {
            const isSelected = option.value === selected;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={option.label}
                onPress={() => onSelect(option.value)}
                // Object form: structural styles are dropped in the
                // `({ pressed }) => ...` form on device.
                // Cause unknown; see the CLAUDE.md gotcha.
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  backgroundColor: isSelected
                    ? 'rgba(28,24,20,0.06)'
                    : 'transparent',
                }}
              >
                <Text
        allowFontScaling={false}
                  className={
                    isSelected ? 'font-inter-tight-medium' : 'font-inter-tight'
                  }
                  style={{ flex: 1, fontSize: 12, letterSpacing: 0.2, color: '#1C1814' }}
                >
                  {option.label}
                </Text>
                <Text
        allowFontScaling={false}
                  className="font-inter-tight-medium"
                  style={{ fontSize: 10, letterSpacing: 1.4, color: '#6F6658' }}
                >
                  {String(counts[option.value])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}
