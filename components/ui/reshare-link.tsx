import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { CARD_COPY } from '@/lib/card-copy';
import { reshare, typePresets } from '@/lib/theme';

type Props = {
  onPress: () => void;
  /** Ink. Dark on the white card and on a bubble fill, which is everywhere it sits. */
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * "Reshare on Instagram", on a story the guest tagged the venue in. (TAC-585.)
 *
 * Opens the guest's Instagram thread and does nothing else: no approve, no
 * send, no dismiss. The reshare itself is Instagram's own "Add to your story"
 * button inside that thread.
 *
 * **A real `Pressable`, so it must never have a `GestureDetector` above it.**
 * A Pressable inside one wins RN's responder race and kills both the pan and
 * the tap composed with it (CLAUDE.md, TAC-37). On a live queue card the stack
 * therefore renders this in a layer BESIDE the detector, over a slot the card
 * leaves empty; see `FrontCard` in `components/queue/queue-card-stack.tsx`.
 */
export function ReshareLink({ onPress, color = '#1C1814', style }: Props) {
  return (
    <Pressable
      testID="reshare-link"
      accessibilityRole="link"
      accessibilityLabel={CARD_COPY.media.reshare}
      hitSlop={reshare.hitSlopPx}
      onPress={onPress}
      // Object form for anything structural, per the CLAUDE.md Pressable
      // gotcha. The function form carries press feedback only.
      style={[{ alignSelf: 'flex-start' }, style]}
    >
      {({ pressed }) => (
        <TrackedCaps
          {...typePresets.link}
          color={color}
          decorative
          style={{
            textDecorationLine: 'underline',
            opacity: pressed ? reshare.pressedOpacity : 1,
          }}
        >
          {CARD_COPY.media.reshare}
        </TrackedCaps>
      )}
    </Pressable>
  );
}
