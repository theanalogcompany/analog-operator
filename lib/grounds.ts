/**
 * Every full-bleed screen ground and every card strip colour, as data.
 *
 * The values are TAC-364's design spec ("Queue Card Colors"): five card
 * grounds, one per kind of decision, and clay, the resting state for every
 * screen with nothing to decide. This module exists so a colour change lands in
 * ONE file: no screen, component or test hardcodes a gradient. Screens name a
 * `GroundName`; `components/ground/ground.tsx` renders it.
 *
 * Names are ROLES, not hues. Card grounds are named for the decision
 * (`obligation`, `midThread`, …) and the hues (Damson, Honey, …) stay private
 * to this file, so pointing a role at a different hue changes nothing outside
 * it. That is a real contingency, not tidiness: if Amber and Honey don't
 * separate on device, the spec's fix is to move mid-thread to Pewter and give
 * the bad-draft bucket a new hue, which is an edit to `HUE_BY_ROLE` alone.
 *
 * Layer order is bottom-first, matching RN paint order: `layers[0]` is the base
 * ramp, then the highlight, then the top scrim.
 *
 * The spec's contrast figures are for the CSS composite. What RN draws from
 * these layers is recomputed by `__tests__/lib/ground-contrast.test.ts`, which
 * fails if a change drops white text below 4.5:1 where text sits. Change a
 * value here and let that test recompute; don't estimate.
 */

/** A single `expo-linear-gradient` layer. */
export type GradientLayer = {
  /** Debug/readability only — never rendered. */
  readonly role: 'ramp' | 'highlight' | 'scrim';
  readonly colors: readonly [string, string, ...string[]];
  readonly locations?: readonly number[];
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
};

export type Ground = {
  readonly layers: readonly GradientLayer[];
};

/** The grounds a queue card sits on, one per kind of decision. */
export type CardGroundName =
  | 'obligation'
  | 'outsideDraft'
  | 'draftWrong'
  | 'midThread'
  | 'headsUp';

/**
 * `slate` is the seventh ground and the only one that is NOT a
 * `CardGroundName`. That is the whole point of keeping it out: a card ground
 * names a KIND OF DECISION, and "the reply window closed" is not one. An
 * expired card has left play, so it leaves its bucket colour with it, and
 * `slate` is an OVERRIDE applied on top of whatever bucket the card is in
 * rather than a bucket of its own. Adding it to `CardGroundName` would let
 * `bucketForItem` return it and quietly break that invariant. (TAC-486.)
 */
export type GroundName = CardGroundName | 'resting' | 'auth' | 'slate';

export const CARD_GROUND_NAMES: readonly CardGroundName[] = [
  'obligation',
  'outsideDraft',
  'draftWrong',
  'midThread',
  'headsUp',
];

export const GROUND_NAMES: readonly GroundName[] = [
  ...CARD_GROUND_NAMES,
  'resting',
  'auth',
  'slate',
];

const TOP_TO_BOTTOM = { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } } as const;

/**
 * CSS `linear-gradient(168deg, …)` as start and end points, exact on the
 * 402 x 874 design frame.
 *
 * CSS draws the gradient along a line through the box's centre, pointing
 * (sin a, −cos a) with y down, and long enough that the far corners land on 0%
 * and 100%: |W sin a| + |H cos a|. For 168° those endpoints sit just outside the
 * box, which is correct. Both native gradients extend the end colours past the
 * points, so a start above the top edge paints the top edge in the colour the
 * CSS gives it there.
 *
 * The previous value, (0.396, 0.011) → (0.604, 0.989), took the direction
 * vector in unit space. On a screen more than twice as tall as it is wide that
 * is a much steeper line: it drew about 6° off vertical instead of 12°. (TAC-364.)
 */
const ANGLE_168 = {
  start: { x: 0.257, y: -0.025 },
  end: { x: 0.743, y: 1.025 },
} as const;

function rgba(tint: string, alpha: number): string {
  return `rgba(${tint},${Math.round(alpha * 10_000) / 10_000})`;
}

/**
 * Approximates `radial-gradient(<w> <h> at 50% <cy>, rgba(tint, a), transparent <stop>)`
 * as a vertical linear.
 *
 * RN has no radial gradient, and the two exact options (Skia, a baked PNG per
 * ground) cost a native module or a re-export on every colour change. The
 * spec's radial is 180% wide, so across the screen its horizontal falloff is
 * small and the vertical axis carries the effect. Down the vertical centre line
 * this is exact; off-centre it is slightly brighter than the CSS, which lowers
 * contrast rather than raising it.
 *
 * The CSS stop is a fraction of the radius, and the radius is `radiusY` of the
 * box height, so alpha falls linearly to 0 at `radiusY * stop` either side of
 * the centre. When that reach passes an edge of the box, the stop AT the edge
 * carries the alpha the radial has there, not 0. The spec's geometry (centre
 * 55%, reach 62%) passes both edges. Clamping to transparent at the edge, as
 * this helper used to, cut the highlight off below the card, which is exactly
 * the brightening the geometry exists for. (TAC-364.)
 */
function verticalHighlight(args: {
  tint: string;
  alpha: number;
  centerY: number;
  radiusY: number;
  stop: number;
}): GradientLayer {
  const { tint, alpha, centerY, radiusY, stop } = args;
  const reach = radiusY * stop;
  const at = (y: number): string =>
    rgba(tint, alpha * Math.max(0, 1 - Math.abs(y - centerY) / reach));
  const top = Math.max(0, centerY - reach);
  const bottom = Math.min(1, centerY + reach);
  return {
    role: 'highlight',
    colors: [at(0), at(top), at(centerY), at(bottom), at(1)],
    locations: [0, top, centerY, bottom, 1],
    ...TOP_TO_BOTTOM,
  };
}

type Hue = {
  readonly ramp: readonly [string, string, string];
  readonly strip: string;
  /** The highlight's colour, as `r,g,b`. */
  readonly tint: string;
};

/** A warm pink under the two red-family hues, a warm white under the rest. */
const ROSE_TINT = '229,177,156';
const CREAM_TINT = '247,241,227';

const DAMSON: Hue = {
  ramp: ['#8A5563', '#633A46', '#3A2029'],
  strip: '#5E3641',
  tint: ROSE_TINT,
};

const AMBER: Hue = {
  ramp: ['#B0762B', '#84561C', '#4A2F10'],
  strip: '#7A4F19',
  tint: CREAM_TINT,
};

const PEWTER: Hue = {
  ramp: ['#78736B', '#55514A', '#2E2C28'],
  strip: '#4F4B45',
  tint: CREAM_TINT,
};

/**
 * The strip is darker than the spec's `#8E7C4E`, which gives white 9.5px caps
 * only 4.08:1. The same hue and saturation at lightness 0.407 reaches 4.51:1.
 * The spec's contrast figures covered grounds, not strips. (Accepted
 * 2026-09-14.)
 */
const HONEY: Hue = {
  ramp: ['#C3AE7C', '#9A8757', '#564A2F'],
  strip: '#86754A',
  tint: CREAM_TINT,
};

const BAY: Hue = {
  ramp: ['#77805F', '#555C42', '#2F3324'],
  strip: '#4F563E',
  tint: CREAM_TINT,
};

/** Which hue each kind of decision wears. The one place to re-point a role. */
const HUE_BY_ROLE: Record<CardGroundName, Hue> = {
  obligation: DAMSON,
  outsideDraft: AMBER,
  draftWrong: PEWTER,
  midThread: HONEY,
  headsUp: BAY,
};

/**
 * The highlight lifts the white card off the ground, so card grounds run it
 * strong: the card covers mid-screen and no text sits there. Clay carries body
 * copy directly (Texts, You, sign-in, the empty queue), and a strong highlight
 * would wash that copy out, so clay's is quiet.
 */
const CARD_HIGHLIGHT = 0.26;
const CLAY_HIGHLIGHT = 0.12;

/**
 * Slate runs its highlight quieter than a card ground. The design hand-off
 * specifies `rgba(247,241,227,0.14)` rather than the card grounds' 0.26: an
 * expired card has left play, and the lift that makes a live card look
 * actionable is exactly what this ground should not do.
 */
const SLATE_HIGHLIGHT = 0.14;

function buildGround(
  ramp: readonly [string, string, string],
  tint: string,
  highlightAlpha: number,
): Ground {
  return {
    layers: [
      {
        role: 'ramp',
        colors: ramp,
        locations: [0, 0.46, 1],
        ...ANGLE_168,
      },
      verticalHighlight({
        tint,
        alpha: highlightAlpha,
        centerY: 0.55,
        radiusY: 1,
        stop: 0.62,
      }),
      {
        // Top scrim: buys the nav row its contrast against the ramp.
        role: 'scrim',
        colors: [
          'rgba(26,16,10,0.58)',
          'rgba(26,16,10,0.42)',
          'rgba(26,16,10,0)',
          'rgba(26,16,10,0)',
        ],
        locations: [0, 0.26, 0.54, 1],
        ...TOP_TO_BOTTOM,
      },
    ],
  };
}

function cardGround(role: CardGroundName): Ground {
  const hue = HUE_BY_ROLE[role];
  return buildGround(hue.ramp, hue.tint, CARD_HIGHLIGHT);
}

/**
 * Clay: the resting state for every screen with nothing to decide. ONE value,
 * sign-in included, so those screens can't drift apart.
 */
const CLAY: Ground = buildGround(
  ['#9E4E30', '#8A3E24', '#48210F'],
  ROSE_TINT,
  CLAY_HIGHLIGHT,
);

/**
 * Slate: the ground an EXPIRED Instagram card sits on, whatever bucket it was
 * in. Built by the same function as every other ground, so it composites
 * identically and `__tests__/lib/ground-contrast.test.ts` can measure it.
 * (TAC-486.)
 */
const SLATE: Ground = buildGround(
  ['#4D4A46', '#383633', '#1F1E1C'],
  CREAM_TINT,
  SLATE_HIGHLIGHT,
);

export const GROUNDS: Record<GroundName, Ground> = {
  obligation: cardGround('obligation'),
  outsideDraft: cardGround('outsideDraft'),
  draftWrong: cardGround('draftWrong'),
  midThread: cardGround('midThread'),
  headsUp: cardGround('headsUp'),
  /**
   * Texts, a thread, You, the empty queue, and the ground the cold-launch
   * entrance resolves into. `resting` and the entrance must be the same value,
   * or the entrance ends by transitioning into the empty state, which TAC-384's
   * third case forbids. (TAC-384.)
   */
  resting: CLAY,
  /**
   * Sign-in and verify. A separate name from `resting` because it is a
   * separate role, but the same object: one clay. (TAC-364.)
   */
  auth: CLAY,
  /**
   * An expired Instagram card, whatever its bucket. Not a `CardGroundName` —
   * see the note on `GroundName` above.
   */
  slate: SLATE,
};

/** The card flag strip's fill, one per card ground. */
export const STRIP_COLORS: Record<CardGroundName, string> = {
  obligation: HUE_BY_ROLE.obligation.strip,
  outsideDraft: HUE_BY_ROLE.outsideDraft.strip,
  draftWrong: HUE_BY_ROLE.draftWrong.strip,
  midThread: HUE_BY_ROLE.midThread.strip,
  headsUp: HUE_BY_ROLE.headsUp.strip,
};

/**
 * The flag strip on an EXPIRED card: ink, not a bucket colour.
 *
 * Its own constant rather than an entry in `STRIP_COLORS`, because that map is
 * keyed by `CardGroundName` and expiry is not one (see `GroundName`).
 *
 * **The hand-off contradicts itself here and this is the correction.** Its
 * README A3 gives slate a `strip token #2B2926`, while README A4's expired-card
 * table and the artwork itself both render `#1C1814`. Ruled 2026-09-23 in favour
 * of A4 and the artwork. `#2B2926` is slate's nominal strip and nothing uses it,
 * so it is not defined here rather than sitting unused. (TAC-486.)
 */
export const EXPIRED_STRIP_COLOR = '#1C1814';

/**
 * iMessage blue, as the fill of the "Chat with Jaipal" pill (see `HelpFooter`).
 * One step darker than stock `#007AFF` at the same hue: white 9.5pt caps on
 * stock give 4.02:1, on this 4.51:1. __tests__/lib/ground-contrast.test.ts holds
 * the figures. (TAC-388.)
 */
export const MESSAGES_BLUE = '#0072EF';

/**
 * The veil's darkest stop, and the flat colour painted under the ground while an
 * entrance owns it (see `GroundScreen`). Without it, what shows through a ground
 * that is still fading in is the navigator's default light grey. (TAC-384.)
 */
export const VEIL_BASE_COLOR = '#1C0D06';

/**
 * The cold-launch entrance's near-black veil (TAC-384).
 *
 * Deliberately NOT a `GroundName`: no screen names it, it never appears in
 * `GROUND_NAMES`, and it is not a resting state for anything — it is one layer
 * of one animation, which happens to be a gradient and therefore belongs in
 * this file rather than hardcoded into a component.
 *
 * A single ramp, no highlight and no scrim: it is already dark enough that
 * neither would read, and the mark on top of it is pure white.
 */
export const VEIL_GROUND: Ground = {
  layers: [
    {
      role: 'ramp',
      colors: ['#3A1A0C', VEIL_BASE_COLOR],
      locations: [0, 1],
      ...ANGLE_168,
    },
  ],
};
