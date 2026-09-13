/**
 * The five full-bleed screen grounds, as data.
 *
 * PLACEHOLDER COLORS. Every value below is pending a separate color exercise
 * (design handoff, "Fidelity"). This module exists so that exercise lands in
 * ONE file: no screen, component or test may hardcode a gradient. Screens name
 * a `GroundName`; `components/ground/ground.tsx` renders it.
 *
 * Five names, keyed by ROLE rather than by hue, because only three distinct
 * values exist today but five roles do. `neutral` currently aliases the stone
 * value and `auth` aliases the clay value — when the color exercise gives the
 * sign-in flow or the non-queue screens their own identity, they stop being
 * aliases and nothing outside this file changes.
 *
 * Layer order is bottom-first, matching RN paint order: `layers[0]` is the base
 * ramp, later entries stack on top.
 *
 * On the radial highlight: RN has no `radial-gradient`, and the two honest
 * exact options (Skia, a pre-rendered PNG per ground) each cost more than the
 * layer is worth while its colors are still placeholders — Skia is a native
 * module that breaks Expo Go, and a baked PNG would have to be re-exported on
 * every color swap, which is the one thing this module is here to prevent. So
 * the highlight is approximated as a vertical multi-stop linear. That reads
 * closer than it sounds: both source radials are 120% wide, so their horizontal
 * falloff happens off-screen and the vertical axis carries the whole effect.
 * The `locations` below are derived from the CSS, not eyeballed — see
 * `verticalHighlight`.
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

export type GroundName =
  | 'queueClay'
  | 'queueStone'
  | 'queueInk'
  | 'neutral'
  | 'auth';

export const GROUND_NAMES: readonly GroundName[] = [
  'queueClay',
  'queueStone',
  'queueInk',
  'neutral',
  'auth',
];

const TOP_TO_BOTTOM = { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } } as const;

/**
 * CSS `linear-gradient(168deg, …)` as normalized start/end coords.
 *
 * CSS measures the gradient angle clockwise from "to top", so the direction
 * vector in screen space (x right, y down) is (sin a, -cos a). For 168° that's
 * (0.208, 0.978) — mostly downward with a slight rightward lean. Projecting
 * that through the center of the box gives the endpoints below. Hardcoded
 * rather than computed at runtime so the values are greppable.
 */
const ANGLE_168 = {
  start: { x: 0.396, y: 0.011 },
  end: { x: 0.604, y: 0.989 },
} as const;

/**
 * Approximates `radial-gradient(<w> <h> at 50% <cy>, <color>, transparent <s>)`
 * as a vertical linear.
 *
 * The CSS stop `s` is a fraction of the radius, and the radius here is `h` (a
 * fraction of box height), so the highlight reaches full transparency `h * s`
 * away from the center in each direction. Everything outside that band is
 * transparent, which is what the two clamp stops at 0 and 1 pin down.
 */
function verticalHighlight(args: {
  color: string;
  transparent: string;
  centerY: number;
  radiusY: number;
  stop: number;
}): GradientLayer {
  const { color, transparent, centerY, radiusY, stop } = args;
  const reach = radiusY * stop;
  const top = Math.max(0, centerY - reach);
  const bottom = Math.min(1, centerY + reach);
  return {
    role: 'highlight',
    colors: [transparent, color, transparent, transparent],
    locations: [top, centerY, bottom, 1],
    ...TOP_TO_BOTTOM,
  };
}

/** clay — reservation + low-fidelity flags, and (via `auth`) the sign-in flow. */
const CLAY: Ground = {
  layers: [
    {
      role: 'ramp',
      colors: ['#A85B3C', '#97472B', '#5E2D17'],
      locations: [0, 0.46, 1],
      ...ANGLE_168,
    },
    verticalHighlight({
      color: 'rgba(229,177,156,0.3)',
      transparent: 'rgba(229,177,156,0)',
      centerY: 0.48,
      radiusY: 0.7,
      stop: 0.62,
    }),
    {
      // Top scrim: buys the nav row its contrast against the ramp.
      role: 'scrim',
      colors: [
        'rgba(26,16,10,0.38)',
        'rgba(26,16,10,0.26)',
        'rgba(26,16,10,0)',
        'rgba(26,16,10,0)',
      ],
      locations: [0, 0.26, 0.46, 1],
      ...TOP_TO_BOTTOM,
    },
  ],
};

/** stone — new-guest flag, and (via `neutral`) every non-queue screen. */
const STONE: Ground = {
  layers: [
    {
      role: 'ramp',
      colors: ['#94897A', '#6B6252', '#332E27'],
      locations: [0, 0.46, 1],
      ...ANGLE_168,
    },
    verticalHighlight({
      color: 'rgba(247,241,227,0.26)',
      transparent: 'rgba(247,241,227,0)',
      centerY: 0.48,
      radiusY: 0.7,
      stop: 0.62,
    }),
    {
      role: 'scrim',
      colors: [
        'rgba(22,17,12,0.42)',
        'rgba(22,17,12,0.30)',
        'rgba(22,17,12,0)',
        'rgba(22,17,12,0)',
      ],
      locations: [0, 0.26, 0.46, 1],
      ...TOP_TO_BOTTOM,
    },
  ],
};

/** ink — no draft generated. Dark enough that it needs no top scrim. */
const INK: Ground = {
  layers: [
    {
      role: 'ramp',
      colors: ['#554D42', '#332D26', '#1A1715'],
      locations: [0, 0.5, 1],
      ...ANGLE_168,
    },
    verticalHighlight({
      color: 'rgba(133,122,106,0.42)',
      transparent: 'rgba(133,122,106,0)',
      centerY: 0.1,
      radiusY: 0.76,
      stop: 0.62,
    }),
  ],
};

export const GROUNDS: Record<GroundName, Ground> = {
  queueClay: CLAY,
  queueStone: STONE,
  queueInk: INK,
  // Aliases today, distinct roles tomorrow. Do not collapse these call sites
  // back onto `queueStone` / `queueClay` — the indirection is the feature.
  neutral: STONE,
  auth: CLAY,
};
