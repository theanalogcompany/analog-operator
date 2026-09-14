import { View } from 'react-native';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type RecognitionState } from '@/lib/api/queue';
import { recognition, typePresets } from '@/lib/theme';

/**
 * `card` — on a white surface (the queue card's head, the texts list menu).
 * `ground` — on a gradient ground (the thread header, the edit takeover).
 *
 * The redesign drops the filled pill and the state-colored dot in favour of one
 * outlined, square-cornered badge in both places. Recognition is context, not a
 * status light; four fill colors competing with the flag strip was noise.
 */
type Variant = 'card' | 'ground';

const VARIANTS: Record<Variant, { border: string; color: string }> = {
  card: { border: 'rgba(28,24,20,0.25)', color: '#4A4339' },
  ground: { border: 'rgba(255,255,255,0.5)', color: '#FFFFFF' },
};

type Props = {
  /** `null` = "we don't have recognition data yet"; renders no badge. */
  state: RecognitionState | null;
  variant?: Variant;
};

export function RecognitionBadge({ state, variant = 'card' }: Props) {
  if (state === null) return null;

  const { border, color } = VARIANTS[variant];
  const label = recognition.stateLabels[state];
  return (
    <View
      accessibilityLabel={`Recognition: ${label}`}
      style={{
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: border,
        // Square corners are the point — the old pill read as a chip.
        borderRadius: 0,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <TrackedCaps {...typePresets.badge} color={color} decorative>
        {label}
      </TrackedCaps>
    </View>
  );
}
