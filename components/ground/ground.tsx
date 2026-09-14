import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { GROUNDS, type Ground as GroundValue, type GroundName } from '@/lib/grounds';

/**
 * Paints an arbitrary ground value as stacked full-bleed gradient layers.
 *
 * Split out from `Ground` so the cold-launch veil — which is a gradient but
 * deliberately not a named screen ground — can reuse the same painter instead
 * of hand-rolling a second `LinearGradient` stack. (TAC-384.)
 *
 * `dither` is on for the same reason it is on the swipe washes: multi-stop
 * alpha ramps band visibly on-device.
 */
export function GroundPaint({ ground }: { ground: GroundValue }) {
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      // A ground is decorative; screen readers should walk straight past it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ground.layers.map((layer, i) => (
        <LinearGradient
          // Layers are a fixed, ordered list per ground; index is stable.
          key={`${layer.role}-${i}`}
          colors={layer.colors as unknown as readonly [string, string, ...string[]]}
          locations={
            layer.locations as unknown as
              | readonly [number, number, ...number[]]
              | undefined
          }
          start={layer.start}
          end={layer.end}
          dither
          style={StyleSheet.absoluteFill}
        />
      ))}
    </View>
  );
}

type Props = {
  name: GroundName;
};

/**
 * Paints one named ground.
 *
 * Knows nothing about screens, tones or navigation — it renders whatever
 * `lib/grounds.ts` says the name means.
 */
export function Ground({ name }: Props) {
  return <GroundPaint ground={GROUNDS[name]} />;
}
