// Anchored dropdown, not a Modal — RN's Modal always covers the full
// window and doesn't support anchoring under a specific pill the way this
// needs to. The backdrop Pressable fills its immediate parent (the screen's
// outer flex:1 container — see app/conversations/index.tsx), which is how
// RN's default `position: relative` on every View makes an
// `inset:0`-style absolute child cover the whole screen without a Modal.
//
// The backdrop's `zIndex: 4` is required, not decorative: this component
// renders above the row list in app/conversations/index.tsx's JSX, but RN's
// hit-testing tie-break for overlapping siblings with equal/unset zIndex
// goes to whichever comes LATER in source order — the row list, which
// renders after this component. Without an explicit zIndex here, a tap
// meant to dismiss the dropdown over the list area instead hits a row's own
// Pressable and navigates away. zIndex 4 sits below the menu panel's zIndex
// 5 (so tapping an option still wins over the backdrop) but above the row
// list's implicit default (so tap-outside-to-dismiss works everywhere,
// including over the list). Caught in Task 11 review; the omission
// originated in this file at Task 10.

import { Pressable, Text, View } from 'react-native';

import { type RecognitionState } from '@/lib/api/queue';
import { recognition } from '@/lib/theme';

export type TypeFilterOption = 'all' | RecognitionState;

type Props = {
  visible: boolean;
  selected: TypeFilterOption;
  counts: Record<TypeFilterOption, number>;
  onSelect: (option: TypeFilterOption) => void;
  onDismiss: () => void;
};

const OPTIONS: { key: TypeFilterOption; label: string }[] = [
  { key: 'all', label: 'All guests' },
  { key: 'new', label: recognition.stateLabels.new },
  { key: 'returning', label: recognition.stateLabels.returning },
  { key: 'regular', label: recognition.stateLabels.regular },
  { key: 'raving_fan', label: recognition.stateLabels.raving_fan },
];

export function TypeFilterMenu({ visible, selected, counts, onSelect, onDismiss }: Props) {
  if (!visible) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss filter menu"
        onPress={onDismiss}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 4 }}
      />
      <View
        className="rounded-[12px] border-[0.5px] border-hairline bg-white"
        style={{
          position: 'absolute',
          top: 38,
          left: 96,
          minWidth: 172,
          padding: 5,
          shadowColor: '#1C1814',
          shadowOpacity: 0.16,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 28,
          elevation: 8,
          zIndex: 5,
        }}
      >
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.key;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              onPress={() => onSelect(opt.key)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingHorizontal: 10,
                paddingVertical: 9,
                borderRadius: 8,
                backgroundColor: pressed || isSelected ? 'rgba(28, 24, 20, 0.06)' : 'transparent',
              })}
            >
              <Text
                className={
                  isSelected ? 'font-inter-tight-medium text-ink' : 'font-inter-tight text-ink'
                }
                style={{ fontSize: 13, flex: 1 }}
              >
                {opt.label}
              </Text>
              <Text className="font-inter-tight text-ink-faint" style={{ fontSize: 11 }}>
                {counts[opt.key]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
