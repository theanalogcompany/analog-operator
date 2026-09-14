import {
  CARD_GROUND_NAMES,
  GROUNDS,
  MESSAGES_BLUE,
  STRIP_COLORS,
  type CardGroundName,
  type GradientLayer,
  type Ground,
} from '@/lib/grounds';
import {
  dividerBacking,
  groundText,
  layout,
  nav,
  reviewDetail,
  takeoverHeader,
  typePresets,
} from '@/lib/theme';

/**
 * White text against the grounds, computed from `lib/grounds.ts` the way
 * expo-linear-gradient draws it, on the 402 x 874 design frame.
 *
 * TAC-364's spec quotes its contrast figures for the CSS composite and says to
 * recompute rather than estimate when a ground changes. This is that recompute,
 * run on every change. Each layer is an axial gradient between its start and
 * end points, with isolines perpendicular in pixels and stops interpolated
 * linearly. Layers are composited source-over in sRGB, and contrast is WCAG 2.
 */

const W = 402;
const H = 874;

type RGB = readonly [number, number, number];
type RGBA = readonly [number, number, number, number];

function parseColor(color: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (rgba) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  }
  throw new Error(`unparsed colour ${color}`);
}

function sampleLayer(layer: GradientLayer, px: number, py: number): RGBA {
  const sx = layer.start.x * W;
  const sy = layer.start.y * H;
  const dx = layer.end.x * W - sx;
  const dy = layer.end.y * H - sy;
  const t = Math.min(1, Math.max(0, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)));
  const colors = layer.colors.map(parseColor);
  const locations =
    layer.locations ?? colors.map((_, i) => i / (colors.length - 1));
  for (let i = 1; i < colors.length; i++) {
    if (t <= locations[i]) {
      const span = locations[i] - locations[i - 1];
      const f = span === 0 ? 0 : (t - locations[i - 1]) / span;
      const [a, b] = [colors[i - 1], colors[i]];
      return [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
        a[3] + (b[3] - a[3]) * f,
      ];
    }
  }
  return colors[colors.length - 1];
}

function composite(ground: Ground, px: number, py: number): RGB {
  let out: RGB = [0, 0, 0];
  for (const layer of ground.layers) {
    const [r, g, b, a] = sampleLayer(layer, px, py);
    out = [out[0] * (1 - a) + r * a, out[1] * (1 - a) + g * a, out[2] * (1 - a) + b * a];
  }
  return out;
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** White at `alpha`, laid over `background`, against `background`. */
function whiteOn(background: RGB, alpha = 1): number {
  const text: RGB = [
    background[0] + (255 - background[0]) * alpha,
    background[1] + (255 - background[1]) * alpha,
    background[2] + (255 - background[2]) * alpha,
  ];
  const [hi, lo] = [luminance(text), luminance(background)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const alphaOf = (color: string): number => parseColor(color)[3];

const span = (from: number, to: number, steps: number): number[] =>
  Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);

/** The nav row and the swipe-hint row, where the spec quotes its figures. */
const NAV_Y = 100;
const HINT_Y = 828;
const NAV_XS = span(26, W - 26, 20);
/** "← Decline" sits left and "Acknowledge →" right; the help link is between. */
const HINT_XS = [...span(26, 150, 10), ...span(W - 150, W - 26, 10)];

function minWhite(ground: Ground, xs: readonly number[], y: number, alpha = 1): number {
  return Math.min(...xs.map((x) => whiteOn(composite(ground, x, y), alpha)));
}

/**
 * TAC-364 design spec, "The five card grounds": white at the nav row and at the
 * hint row, at horizontal centre, through the CSS composite. Transcribed from
 * the ticket, not computed.
 */
const SPEC_WHITE: Record<CardGroundName, readonly [number, number]> = {
  obligation: [11.5, 11.4],
  outsideDraft: [9.2, 8.5],
  draftWrong: [10.1, 9.7],
  midThread: [6.7, 5.9],
  headsUp: [9.6, 9.0],
};

describe('card grounds against the spec', () => {
  // At horizontal centre the RN layers are exact: the ramp's endpoints are the
  // CSS gradient line, and the highlight's vertical falloff is the radial's.
  // Off-centre the highlight runs slightly brighter than the CSS.
  it.each(CARD_GROUND_NAMES)('%s matches the spec figures at centre', (name) => {
    const ground = GROUNDS[name];
    const [nav100, hint828] = SPEC_WHITE[name];
    expect(Math.abs(whiteOn(composite(ground, W / 2, NAV_Y)) - nav100)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(whiteOn(composite(ground, W / 2, HINT_Y)) - hint828)).toBeLessThanOrEqual(0.1);
  });
});

describe('where text sits on the grounds', () => {
  it.each(CARD_GROUND_NAMES)(
    '%s keeps white nav and hint text at 4.5:1 across the whole row',
    (name) => {
      expect(minWhite(GROUNDS[name], NAV_XS, NAV_Y)).toBeGreaterThanOrEqual(4.5);
      expect(minWhite(GROUNDS[name], HINT_XS, HINT_Y)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(CARD_GROUND_NAMES)('%s keeps an inactive nav tab at 4.5:1', (name) => {
    expect(
      minWhite(GROUNDS[name], NAV_XS, NAV_Y, alphaOf(nav.inactiveColor)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  // The spec's figures cover grounds only. The strip carries 9.5px caps, which
  // is not large text, so it needs 4.5:1 on its own. Honey's spec strip gave
  // 4.08:1; its accepted replacement is what this holds.
  it.each(CARD_GROUND_NAMES)('%s strip keeps its white caps at 4.5:1', (name) => {
    const [r, g, b] = parseColor(STRIP_COLORS[name]);
    expect(whiteOn([r, g, b])).toBeGreaterThanOrEqual(4.5);
  });

  // Clay carries body copy directly (Texts, You, sign-in, the empty queue), so
  // it is checked everywhere a line of text could sit, not just at two rows.
  it('clay keeps body copy and chrome at 4.5:1 anywhere on the screen', () => {
    const ground = GROUNDS.resting;
    const xs = span(26, W - 26, 10);
    for (const y of span(layout.mockTopInsetPx, H - 20, 40)) {
      expect(minWhite(ground, xs, y, alphaOf(groundText.body))).toBeGreaterThanOrEqual(4.5);
      expect(minWhite(ground, xs, y, alphaOf(groundText.chrome))).toBeGreaterThanOrEqual(4.5);
    }
    expect(minWhite(ground, NAV_XS, NAV_Y)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The edit takeover puts its header straight onto the card's ground, and on the
 * paler grounds white text loses contrast as it moves down the screen. On Honey
 * it holds 4.5:1 only in about the top third. Recorded on TAC-364 as a known
 * constraint; this is what keeps it true.
 *
 * DEVICE-CONDITIONAL. Everything here is laid out on the 402 x 874 design
 * frame, and a pass says nothing about a shorter phone. The ground scales with
 * the screen and the header doesn't, so a shorter phone fits less of it: on a
 * 375 x 667 iPhone SE, with its 20pt status bar, a fully capped header ends at
 * y=230 while Honey's limit is y=217, 13pt past it. Nothing here checks the SE.
 * Recorded on TAC-364, not fixed.
 */
describe('the edit takeover header', () => {
  const HEADER_XS = span(
    takeoverHeader.blockPaddingHorizontalPx,
    W - takeoverHeader.blockPaddingHorizontalPx,
    20,
  );

  /** The deepest y at which white still clears 4.5:1 across the header's width. */
  function depthLimit(name: CardGroundName): number {
    for (let y = layout.mockTopInsetPx; y < H; y++) {
      if (minWhite(GROUNDS[name], HEADER_XS, y) < 4.5) return y - 1;
    }
    return H;
  }

  // Where the header's last line ends when every part is at its cap: the safe
  // area, the top row (as tall as the name's line height), the header's top
  // padding, the strip label, then each review-detail part and the reasoning,
  // each preceded by the gap. Read from the same tokens the screen lays out with.
  const caps = reviewDetail.takeover;
  const headerTextBottom =
    layout.mockTopInsetPx +
    takeoverHeader.rowPaddingTopPx +
    takeoverHeader.nameLineHeightPx +
    takeoverHeader.blockPaddingTopPx +
    typePresets.flagReason.lineHeight +
    // The Also block at its tallest: every row at its line cap. (TAC-388.)
    [
      caps.reasonLines,
      caps.alsoItems * caps.alsoItemLines,
      caps.claimLines,
      caps.reasoningLines,
    ].reduce(
      (sum, lines) => sum + reviewDetail.gapPx + lines * reviewDetail.lineHeightPx,
      0,
    );

  it.each(CARD_GROUND_NAMES)(
    '%s holds white text to the bottom of a fully capped header',
    (name) => {
      expect(headerTextBottom).toBeLessThanOrEqual(depthLimit(name));
    },
  );

  // The figure recorded on the ticket and in CLAUDE.md is y ≈ 288, on the
  // design frame. If Honey's
  // values change and this moves, update both records along with the test.
  it('keeps the Honey limit the ticket records', () => {
    const limit = depthLimit('midThread');
    expect(limit).toBeGreaterThanOrEqual(280);
    expect(limit).toBeLessThanOrEqual(296);
  });
});

/**
 * The takeover's thread sits on the card's ground too. Its date dividers are
 * white at `groundText.body` in 8.5px tracked caps, which is not large text, so
 * on the takeover each sits on `dividerBacking`. Checked anywhere on the screen
 * rather than only between the header and the composer, so a taller composer or
 * a thread scrolled up can't carry a divider somewhere this doesn't look.
 *
 * The backing fixes a defect older than TAC-364: on main the unbacked dividers
 * were already below 4.5:1 on the stone (3.27) and clay (3.94) card grounds.
 */
describe('the edit takeover date dividers', () => {
  const XS = span(22, W - 22, 24);
  const YS = span(layout.mockTopInsetPx, H, 120);
  const backing = parseColor(dividerBacking.color);

  function minDivider(name: CardGroundName, backed: boolean): number {
    const a = backed ? backing[3] : 0;
    let min = Infinity;
    for (const y of YS) {
      for (const x of XS) {
        const [r, g, b] = composite(GROUNDS[name], x, y);
        const under: RGB = [
          r * (1 - a) + backing[0] * a,
          g * (1 - a) + backing[1] * a,
          b * (1 - a) + backing[2] * a,
        ];
        min = Math.min(min, whiteOn(under, alphaOf(groundText.body)));
      }
    }
    return min;
  }

  it.each(CARD_GROUND_NAMES)('%s keeps a backed divider at 4.5:1 anywhere on the screen', (name) => {
    expect(minDivider(name, true)).toBeGreaterThanOrEqual(4.5);
  });

  // Guards the guard: if the grounds ever change so that no divider needs the
  // backing, this says so, rather than the pill staying on with nothing behind it.
  it('needs the backing: Honey misses 4.5:1 without it', () => {
    expect(minDivider('midThread', false)).toBeLessThan(4.5);
  });
});

/**
 * The "Chat with Jaipal" pill: iMessage blue with a white label, over every
 * ground it renders on. (TAC-388.)
 *
 * The label is 9.5pt tracked caps, normal text under WCAG, so white on the fill
 * needs 4.5:1, and that is the governing figure. Under WCAG 1.4.11 a control
 * identified by its own readable label needs no contrasting boundary, so the
 * pill's edge against the ground is recorded here, not gated. It is below 3:1
 * on every ground and no blue can lift it: white text needs a darker fill and
 * the edge needs a lighter one. Pinned, so a change to a ground or the fill
 * forces someone to read the figures again.
 */
describe('the help pill', () => {
  function contrast(a: RGB, b: RGB): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }
  const rgbOf = (color: string): RGB => {
    const [r, g, b] = parseColor(color);
    return [r, g, b];
  };

  // "CHAT WITH JAIPAL" at 9.5pt with 1.7 tracking is 110.3pt wide (glyph
  // advances from the shipped Inter Tight Medium), plus 10pt either side. The
  // rows cover the hint row, the empty queue and the sign-in footer.
  const PILL_WIDTH = 130.3;
  const XS = span(W / 2 - PILL_WIDTH / 2, W / 2 + PILL_WIDTH / 2, 30);
  const YS = span(812, 842, 15);

  it('keeps its white label at 4.5:1 on the fill', () => {
    expect(whiteOn(rgbOf(MESSAGES_BLUE))).toBeGreaterThanOrEqual(4.5);
  });

  // Why the fill is not stock: stock iMessage blue misses the text bar.
  it('would miss 4.5:1 on stock iMessage blue', () => {
    expect(whiteOn(rgbOf('#007AFF'))).toBeLessThan(4.5);
  });

  const RECORDED_EDGE: Record<keyof typeof GROUNDS, number> = {
    obligation: 2.41,
    outsideDraft: 1.78,
    draftWrong: 2.03,
    midThread: 1.22,
    headsUp: 1.88,
    resting: 2.48,
    auth: 2.48,
  };

  it.each(Object.entries(RECORDED_EDGE))(
    '%s: the pill edge measures what TAC-388 recorded',
    (name, recorded) => {
      const fill = rgbOf(MESSAGES_BLUE);
      let min = Infinity;
      for (const y of YS) {
        for (const x of XS) {
          min = Math.min(min, contrast(fill, composite(GROUNDS[name as keyof typeof GROUNDS], x, y)));
        }
      }
      expect(Math.abs(min - recorded)).toBeLessThanOrEqual(0.02);
    },
  );
});
