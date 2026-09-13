import { Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  children: string;
  /** Font size in px. Pair with `tracking` — spread a preset from
   *  `lib/theme.ts`'s `typePresets` rather than retyping both. */
  size: number;
  /** letterSpacing in px. */
  tracking: number;
  color: string;
  lineHeight?: number;
  weight?: 'regular' | 'medium';
  numberOfLines?: number;
  /** Overrides the default (the original, un-uppercased string). */
  accessibilityLabel?: string;
  /**
   * For text inside an element that already carries its own label — a nav tab,
   * a row, a button. Without this the inner Text contributes a second node
   * with the same label, which both duplicates the VoiceOver announcement and
   * makes `getByLabelText` ambiguous.
   */
  decorative?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * The app's voice: uppercase, tracked, weight 500. Every label, tab, badge,
 * meta line and action in the redesign is one of these.
 *
 * Two things it deliberately handles for you:
 *
 * 1. It uppercases the string in JS rather than via `textTransform`, because
 *    RN does not apply `text-transform` reliably on Android (handoff README,
 *    "Translating to React Native" #3).
 * 2. It keeps the original casing as the accessibility label. VoiceOver can
 *    spell out short all-caps strings letter by letter ("S-E-N-D"), so the
 *    visual transform should not leak into what gets announced.
 */
export function TrackedCaps({
  children,
  size,
  tracking,
  color,
  lineHeight,
  weight = 'medium',
  numberOfLines,
  accessibilityLabel,
  decorative = false,
  style,
}: Props) {
  return (
    <Text
      accessible={decorative ? false : undefined}
      accessibilityLabel={decorative ? undefined : accessibilityLabel ?? children}
      numberOfLines={numberOfLines}
      className={
        weight === 'medium' ? 'font-inter-tight-medium' : 'font-inter-tight'
      }
      style={[{ fontSize: size, letterSpacing: tracking, color, lineHeight }, style]}
    >
      {children.toUpperCase()}
    </Text>
  );
}
