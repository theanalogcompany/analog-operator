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
  | 'resting'
  | 'auth';

export const GROUND_NAMES: readonly GroundName[] = [
  'queueClay',
  'queueStone',
  'queueInk',
  'neutral',
  'resting',
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

/**
 * The highlight exists to make the white queue card pop off the ground — that
 * is a queue job. On the screens with no card (Texts, the thread, You, the
 * empty queue, the whole sign-in flow) white type sits directly on the ground
 * and the highlight only washes it out: at 0.26 it lifts the mid-screen
 * composite far enough that NO white text reaches 4.5:1 against it, not even
 * pure white. So the card grounds keep the full highlight and the type grounds
 * take a much quieter one. That divergence is the entire reason `neutral` and
 * `auth` are separate names rather than aliases.
 */
const CARD_HIGHLIGHT = 0.26;
const CLAY_CARD_HIGHLIGHT = 0.3;
/** Quiet enough that body text clears 4.5:1 at mid-screen. */
const TYPE_HIGHLIGHT = 0.1;

function clayGround(highlightAlpha: number): Ground {
  return {
    layers: [
      {
        role: 'ramp',
        colors: ['#A85B3C', '#97472B', '#5E2D17'],
        locations: [0, 0.46, 1],
        ...ANGLE_168,
      },
      verticalHighlight({
        color: `rgba(229,177,156,${highlightAlpha})`,
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
}

function stoneGround(highlightAlpha: number): Ground {
  return {
    layers: [
      {
        role: 'ramp',
        colors: ['#94897A', '#6B6252', '#332E27'],
        locations: [0, 0.46, 1],
        ...ANGLE_168,
      },
      verticalHighlight({
        color: `rgba(247,241,227,${highlightAlpha})`,
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
}

/** ink — no draft generated. Dark enough that it needs no top scrim, and dark
 *  enough that its highlight never threatens contrast. */
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
  // Card grounds: a white card sits over these, so the highlight stays strong.
  queueClay: clayGround(CLAY_CARD_HIGHLIGHT),
  queueStone: stoneGround(CARD_HIGHLIGHT),
  queueInk: INK,
  // Type grounds: white text sits directly on these, so the highlight drops.
  // These were aliases of the two above until the contrast numbers came in;
  // they are now deliberately different and must not be collapsed back.
  neutral: stoneGround(TYPE_HIGHLIGHT),
  /**
   * The queue with nothing pending, and the ground the cold-launch entrance
   * resolves into.
   *
   * Clay at the TYPE highlight, not the card highlight: "You're all caught up"
   * sits directly on this ground, and 0.26+ washes white text below 4.5:1 (see
   * the note on `CARD_HIGHLIGHT`). Same value as `auth` today and deliberately
   * a separate name — per this module's naming rule, roles get names before
   * they get distinct values, so the sign-in flow and the resting queue can
   * diverge later without touching a screen.
   *
   * TAC-364 makes clay the resting state for every screen with nothing pending.
   * This is the queue's half of that; Texts / thread / You still name `neutral`
   * and move when TAC-364's colour system lands. (TAC-384.)
   */
  resting: clayGround(TYPE_HIGHLIGHT),
  auth: clayGround(TYPE_HIGHLIGHT),
};

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
