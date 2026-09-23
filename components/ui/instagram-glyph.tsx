import Svg, { Path } from 'react-native-svg';

import { CARD_COPY } from '@/lib/card-copy';

type Props = {
  size: number;
  /** Tinted to whatever ink surrounds it. Never the full-colour logo. */
  color: string;
  /**
   * For a glyph inside an element that already carries its own label — a row,
   * a header line. Without this the glyph contributes a second "Instagram"
   * node, which duplicates the VoiceOver announcement and makes
   * `getByLabelText` ambiguous. Same reasoning as `TrackedCaps`'s prop.
   */
  decorative?: boolean;
};

/**
 * Meta's official monochrome Instagram glyph, as a single path.
 *
 * Transcribed from Meta's brand resources on a 24x24 box, NOT redrawn: the
 * hand-off is explicit that the mock's rounded-square-and-circle stand-in is a
 * placeholder and the real mark goes in. Redrawing a trademarked glyph by hand
 * gets the corner radii and the lens proportions subtly wrong, and it is the
 * one mark on this screen that belongs to someone else.
 */
const GLYPH_PATH =
  'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z';

/**
 * The Instagram mark, in the surrounding ink.
 *
 * **Monochrome, always.** The drain bar above it already carries Instagram's
 * gradient, and a second gradient on the same card would compete with the
 * bucket strip for the operator's eye. It marks a channel; it is not a badge.
 */
export function InstagramGlyph({ size, color, decorative = false }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : CARD_COPY.replyWindow.instagram}
      importantForAccessibility={decorative ? 'no-hide-descendants' : undefined}
    >
      <Path d={GLYPH_PATH} fill={color} />
    </Svg>
  );
}
