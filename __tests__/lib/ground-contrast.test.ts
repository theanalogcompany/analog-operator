import {
  CARD_GROUND_NAMES,
  EXPIRED_STRIP_COLOR,
  GROUNDS,
  MESSAGES_BLUE,
  STRIP_COLORS,
  type CardGroundName,
  type GradientLayer,
  type Ground,
} from '@/lib/grounds';
import {
  display,
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
/**
 * Slate, the ground an expired Instagram card sits on (TAC-486).
 *
 * Deliberately NOT in `CARD_GROUND_NAMES` — expiry is an override, not a kind
 * of decision — so it needs its own rows rather than riding the `it.each`
 * blocks above, and a change to it cannot be caught by them.
 *
 * An expired card still shows the nav row and still shows the hint row, which
 * keeps the "Chat with Jaipal" pill: the side hints go, but the one escape
 * hatch on the card most likely to confuse an operator stays. So white has to
 * clear 4.5:1 in both rows, and the pill sits on this ground too.
 */
describe('slate, the expired card ground', () => {
  it('keeps white nav and hint text at 4.5:1 across the whole row', () => {
    expect(minWhite(GROUNDS.slate, NAV_XS, NAV_Y)).toBeGreaterThanOrEqual(4.5);
    expect(minWhite(GROUNDS.slate, HINT_XS, HINT_Y)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps an inactive nav tab at 4.5:1', () => {
    expect(
      minWhite(GROUNDS.slate, NAV_XS, NAV_Y, alphaOf(nav.inactiveColor)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  // The expired strip carries the same 9.5px white caps as every other strip
  // ("Reply window closed"), which is not large text, so it needs 4.5:1 on its
  // own rather than inheriting the ground's figure.
  it('keeps the expired strip white caps at 4.5:1', () => {
    const [r, g, b] = parseColor(EXPIRED_STRIP_COLOR);
    expect(whiteOn([r, g, b])).toBeGreaterThanOrEqual(4.5);
  });

  // Checked everywhere rather than at two rows: the blocked-hint line and any
  // ground-level copy on an expired card can sit low on the screen.
  it('keeps body copy at 4.5:1 anywhere on the screen', () => {
    const xs = span(26, W - 26, 10);
    for (const y of span(layout.mockTopInsetPx, H - 20, 40)) {
      expect(
        minWhite(GROUNDS.slate, xs, y, alphaOf(groundText.body)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

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
/**
 * The worst ratio `groundText.body` white reaches over a card ground, sampled
 * across the given grid, optionally through the `dividerBacking` scrim.
 *
 * Shared by the two cases below because the arithmetic is identical: same ink,
 * same alpha, same backing. They stay SEPARATELY NAMED on purpose — a gate
 * named for dividers would take the reply-quote row's gate with it the day
 * dividers change — but there is no reason for both to carry their own copy of
 * the compositor.
 */
function minBackedWhite(
  name: CardGroundName,
  backed: boolean,
  xs: number[],
  ys: number[],
): number {
  const backing = parseColor(dividerBacking.color);
  const a = backed ? backing[3] : 0;
  let min = Infinity;
  for (const y of ys) {
    for (const x of xs) {
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

describe('the edit takeover date dividers', () => {
  const XS = span(22, W - 22, 24);
  const YS = span(layout.mockTopInsetPx, H, 120);

  const minDivider = (name: CardGroundName, backed: boolean) =>
    minBackedWhite(name, backed, XS, YS);

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
 * The takeover's "Replying to" row, which quotes the guest message a draft is
 * answering. (TAC-533.)
 *
 * It sits on the card's ground like the date dividers, takes the same
 * `dividerBacking` scrim, and carries `groundText.body` in 8.5pt tracked caps
 * (the label) and 12.5px (the quote). Both are NORMAL text under WCAG — RN's
 * fontSize is points, so the quote is 12.5pt, nowhere near the 18pt /
 * 14pt-bold large-text threshold — so
 * 4.5:1 governs both. The two differ in size but never in ratio: contrast
 * depends on colour alone and both carry the same one.
 *
 * Asserted separately rather than leaned on the divider case above, although
 * the arithmetic is identical today. That case is named and scoped to dividers;
 * if their alpha or their backing ever changes, the test moves with them and
 * this row would silently lose its only gate. CLAUDE.md's rule is to point at
 * the thing that enforces a property rather than to assert the property, so
 * this row points at a case of its own.
 */
describe('the edit takeover reply-quote row', () => {
  const XS = span(20, W - 20, 24);
  const YS = span(layout.mockTopInsetPx, H, 120);

  it.each(CARD_GROUND_NAMES)('%s keeps the backed row at 4.5:1 anywhere on the screen', (name) => {
    expect(minBackedWhite(name, true, XS, YS)).toBeGreaterThanOrEqual(4.5);
  });

  // The row sits low, against the composer, which is where Honey is weakest:
  // white holds 4.5:1 there only in the top third of the screen. Unbacked it
  // fails, so the scrim is load-bearing rather than decoration inherited from
  // the divider beside it.
  it('needs the backing: Honey misses 4.5:1 without it', () => {
    expect(minBackedWhite('midThread', false, XS, YS)).toBeLessThan(4.5);
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
/**
 * The empty thread state, on both surfaces. (TAC-411.)
 *
 * `EmptyState variant="thread"` is a single 32px Fraunces line in white,
 * centred in the thread area. The Conversations thread draws it on clay, which
 * the block above already clears at 4.5:1 anywhere; the edit takeover draws it
 * on the card's bucket ground, which is the tight case — white on Honey misses
 * 4.5:1 below roughly y=288.
 *
 * 32px is large text under WCAG 2 (>= 24px regular), so the governing figure
 * is **3:1**, not 4.5:1 — the same reason the takeover's date dividers needed a
 * backing at 8.5px and this does not. The line is centred in a flex region
 * whose extent moves with the header and the composer, so this checks the
 * whole frame rather than one y: wherever the layout puts it, it holds.
 */
describe('the empty thread state', () => {
  const XS = span(40, W - 40, 20);
  const YS = span(layout.mockTopInsetPx, H, 120);
  const backing = parseColor(dividerBacking.color);

  function minTitle(ground: Ground, backed: boolean): number {
    const a = backed ? backing[3] : 0;
    let min = Infinity;
    for (const y of YS) {
      for (const x of XS) {
        const [r, g, b] = composite(ground, x, y);
        const under: RGB = [
          r * (1 - a) + backing[0] * a,
          g * (1 - a) + backing[1] * a,
          b * (1 - a) + backing[2] * a,
        ];
        min = Math.min(min, whiteOn(under));
      }
    }
    return min;
  }

  // The takeover: backed, on every card ground.
  it.each(CARD_GROUND_NAMES)(
    '%s keeps the backed empty-thread line at 3:1 anywhere on the screen',
    (name) => {
      expect(minTitle(GROUNDS[name], true)).toBeGreaterThanOrEqual(3);
    },
  );

  // The Conversations thread: unbacked, on clay. Same rule as the dividers —
  // clay clears the bar on its own, so it gets no pill.
  it('clay keeps the line at 3:1 with no backing, which is why that surface has none', () => {
    expect(minTitle(GROUNDS.resting, false)).toBeGreaterThanOrEqual(3);
  });

  // Guards the guard. Without the backing the line measures 2.62:1 on Honey,
  // so if the grounds ever change such that no surface needs it, this says so
  // rather than the pill staying on with nothing behind it.
  it('needs the backing: Honey misses 3:1 without it', () => {
    expect(minTitle(GROUNDS.midThread, false)).toBeLessThan(3);
  });

  // Guards the reasoning, not just the number: if the line ever stops being
  // large text, 3:1 is the wrong bar and this block measures the wrong thing.
  // 24px is WCAG's threshold at regular weight.
  it('is only allowed 3:1 because the line is large text', () => {
    expect(display.emptyTitle.size).toBeGreaterThanOrEqual(24);
  });
});

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
    // TAC-486, measured rather than transcribed. The highest of the seven, and
    // still under 3:1 like every other ground — accepted for the same reason:
    // the readable white label identifies the control (WCAG 1.4.11).
    slate: 2.98,
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
