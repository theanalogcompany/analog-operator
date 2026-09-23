import { View } from 'react-native';

import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type SubQueuePosition, subQueueLabel } from '@/lib/sub-queue';
import { subQueue, typePresets } from '@/lib/theme';

type Props = {
  spot: SubQueuePosition;
  /** The guest's first word, or their handle. */
  guestName: string;
};

/**
 * "1 / 3 cards for Mia", with one segment per card (TAC-486, C1).
 *
 * The segments are the point: a bare "1 / 3" is a fraction, while three marks
 * with the first one filled is a position you can see at a glance and match
 * against the two cards still behind this one. They are decorative, because the
 * label already says the same thing in words and VoiceOver reading three
 * unlabelled marks would add nothing.
 *
 * Each of the guest's cards keeps its own bucket, ground and strip text, and
 * the strip's own counter still counts the whole deck. This row is the only
 * thing tying them together.
 */
export function SubQueueRow({ spot, guestName }: Props) {
  const label = subQueueLabel(spot, guestName);

  return (
    <View
      testID="sub-queue-row"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: subQueue.gapPx,
        marginTop: 13,
        paddingVertical: subQueue.paddingVerticalPx,
        paddingHorizontal: subQueue.paddingHorizontalPx,
        borderRadius: subQueue.radiusPx,
        backgroundColor: subQueue.backgroundColor,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: subQueue.segment.gapPx }}
      >
        {Array.from({ length: spot.total }, (_, i) => (
          <View
            key={i}
            style={{
              width: subQueue.segment.widthPx,
              height: subQueue.segment.heightPx,
              borderRadius: subQueue.segment.radiusPx,
              backgroundColor:
                i === spot.position - 1
                  ? subQueue.segment.onColor
                  : subQueue.segment.offColor,
            }}
          />
        ))}
      </View>
      <TrackedCaps {...typePresets.subQueue} color={subQueue.ink}>
        {label}
      </TrackedCaps>
    </View>
  );
}
