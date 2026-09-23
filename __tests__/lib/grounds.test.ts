import {
  CARD_GROUND_NAMES,
  GROUNDS,
  GROUND_NAMES,
  STRIP_COLORS,
  VEIL_BASE_COLOR,
  VEIL_GROUND,
  type CardGroundName,
  type GradientLayer,
  type GroundName,
} from '@/lib/grounds';

/**
 * The palette is TAC-364's design spec, transcribed here from the ticket rather
 * than read back off `lib/grounds.ts`: a test derived from the module would
 * agree with any palette at all. What contrast those values produce once the
 * layers are composited is `ground-contrast.test.ts`'s job.
 */
const SPEC: Record<
  CardGroundName,
  { hue: string; ramp: readonly string[]; strip: string; tint: string }
> = {
  obligation: {
    hue: 'Damson',
    ramp: ['#8A5563', '#633A46', '#3A2029'],
    strip: '#5E3641',
    tint: '229,177,156',
  },
  outsideDraft: {
    hue: 'Amber',
    ramp: ['#B0762B', '#84561C', '#4A2F10'],
    strip: '#7A4F19',
    tint: '247,241,227',
  },
  draftWrong: {
    hue: 'Pewter',
    ramp: ['#78736B', '#55514A', '#2E2C28'],
    strip: '#4F4B45',
    tint: '247,241,227',
  },
  // The spec's Honey strip is #8E7C4E, which gives white caps 4.08:1. #86754A,
  // the same hue darker, was accepted on 2026-09-14.
  midThread: {
    hue: 'Honey',
    ramp: ['#C3AE7C', '#9A8757', '#564A2F'],
    strip: '#86754A',
    tint: '247,241,227',
  },
  headsUp: {
    hue: 'Bay',
    ramp: ['#77805F', '#555C42', '#2F3324'],
    strip: '#4F563E',
    tint: '247,241,227',
  },
};

const CLAY_RAMP = ['#9E4E30', '#8A3E24', '#48210F'];
const ROSE_TINT = '229,177,156';
const SCRIM_COLORS = [
  'rgba(26,16,10,0.58)',
  'rgba(26,16,10,0.42)',
  'rgba(26,16,10,0)',
  'rgba(26,16,10,0)',
];

function layerOf(name: GroundName, role: GradientLayer['role']): GradientLayer {
  const layer = GROUNDS[name].layers.find((l) => l.role === role);
  if (!layer) throw new Error(`${name} has no ${role} layer`);
  return layer;
}

function alphaOf(color: string): number {
  const match = /,([\d.]+)\)$/.exec(color);
  if (!match) throw new Error(`no alpha in ${color}`);
  return Number(match[1]);
}

const tintOf = (color: string): string =>
  /^rgba\((\d+,\d+,\d+),/.exec(color)?.[1] ?? '';

/** The angle CSS would call this line, measured clockwise from "to top". */
function cssDegrees(layer: GradientLayer): number {
  const dx = (layer.end.x - layer.start.x) * 402;
  const dy = (layer.end.y - layer.start.y) * 874;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

describe('grounds — names', () => {
  it('declares five card grounds, the two clay roles and slate', () => {
    expect(CARD_GROUND_NAMES).toEqual([
      'obligation',
      'outsideDraft',
      'draftWrong',
      'midThread',
      'headsUp',
    ]);
    expect(GROUND_NAMES).toEqual([
      ...CARD_GROUND_NAMES,
      'resting',
      'auth',
      'slate',
    ]);
  });

  /**
   * Slate is a ground but NOT a card ground, and that separation is the point:
   * a `CardGroundName` names a kind of DECISION, and "the reply window closed"
   * is not one. An expired card keeps its bucket and wears slate over the top.
   *
   * If slate ever appears in `CARD_GROUND_NAMES`, `bucketForItem` can return it
   * and every `it.each(CARD_GROUND_NAMES)` in the contrast suite silently
   * starts covering a ground that has its own explicit rows — which is how the
   * two sets of figures would drift apart without anything failing. (TAC-486.)
   */
  it('keeps slate out of the card grounds', () => {
    expect(CARD_GROUND_NAMES).not.toContain('slate');
    expect(GROUND_NAMES).toContain('slate');
    expect(GROUNDS.slate).toBeDefined();
  });

  // The veil is a gradient but not a screen ground: no screen names it, it is
  // nobody's resting state, and putting it in GROUND_NAMES would offer it to
  // every `GroundName` call site as though a screen could settle on it.
  it('keeps the entrance veil out of the named grounds', () => {
    expect(GROUND_NAMES).not.toContain('veil');
    expect(Object.values(GROUNDS)).not.toContain(VEIL_GROUND);
  });

  it('renders the entrance veil as a single dark ramp', () => {
    expect(VEIL_GROUND.layers).toHaveLength(1);
    const [ramp] = VEIL_GROUND.layers;
    expect(ramp.role).toBe('ramp');
    expect(ramp.colors).toEqual(['#3A1A0C', '#1C0D06']);
  });

  it("paints the entrance underlay in the veil's own darkest stop", () => {
    const [ramp] = VEIL_GROUND.layers;
    expect(ramp.colors[ramp.colors.length - 1]).toBe(VEIL_BASE_COLOR);
  });

  it('defines every declared role', () => {
    for (const name of GROUND_NAMES) {
      expect(GROUNDS[name]).toBeDefined();
    }
  });

  it('has no ground the names list forgot', () => {
    expect(Object.keys(GROUNDS).sort()).toEqual([...GROUND_NAMES].sort());
  });

  it('gives every card ground a strip, and nothing else one', () => {
    expect(Object.keys(STRIP_COLORS).sort()).toEqual([...CARD_GROUND_NAMES].sort());
  });
});

describe('grounds — renderable', () => {
  it.each(GROUND_NAMES)('%s is renderable', (name: GroundName) => {
    const ground = GROUNDS[name];
    expect(ground.layers.length).toBeGreaterThan(0);
    for (const layer of ground.layers) {
      // expo-linear-gradient needs two stops minimum, and one `locations`
      // entry per colour when locations are given at all.
      expect(layer.colors.length).toBeGreaterThanOrEqual(2);
      if (layer.locations) {
        expect(layer.locations.length).toBe(layer.colors.length);
        for (const location of layer.locations) {
          expect(location).toBeGreaterThanOrEqual(0);
          expect(location).toBeLessThanOrEqual(1);
        }
      }
      // The exact 168° endpoints fall just outside the frame vertically, which
      // is where CSS puts them. Both native gradients extend the end colours
      // past the points, so this bounds them near the frame rather than inside
      // it.
      for (const coord of [layer.start, layer.end]) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThanOrEqual(1);
        expect(coord.y).toBeGreaterThanOrEqual(-0.05);
        expect(coord.y).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it('orders every layer stack base-ramp first', () => {
    // Layers paint in array order, so a ramp anywhere but position 0 would
    // cover the highlight and scrim above it.
    for (const name of GROUND_NAMES) {
      expect(GROUNDS[name].layers[0].role).toBe('ramp');
    }
  });

  it('keeps locations monotonically non-decreasing', () => {
    for (const name of GROUND_NAMES) {
      for (const layer of GROUNDS[name].layers) {
        if (!layer.locations) continue;
        const sorted = [...layer.locations].sort((a, b) => a - b);
        expect(layer.locations).toEqual(sorted);
      }
    }
  });
});

describe('grounds — the spec palette', () => {
  it.each(CARD_GROUND_NAMES)('%s wears its spec ramp', (name) => {
    expect(layerOf(name, 'ramp').colors).toEqual(SPEC[name].ramp);
  });

  it.each(CARD_GROUND_NAMES)('%s has its strip', (name) => {
    expect(STRIP_COLORS[name]).toBe(SPEC[name].strip);
  });

  it.each(CARD_GROUND_NAMES)(
    '%s runs the card highlight (0.26) in its tint',
    (name) => {
      const { colors } = layerOf(name, 'highlight');
      expect(Math.max(...colors.map(alphaOf))).toBe(0.26);
      for (const color of colors) {
        expect(tintOf(color)).toBe(SPEC[name].tint);
      }
    },
  );

  // Clay carries body copy directly, so its highlight stays quiet: the spec
  // quotes body text at 0.92 clearing 6.1:1 mid-screen at this alpha.
  it('makes clay the spec ramp with a quiet highlight (0.12) in the rose tint', () => {
    expect(layerOf('resting', 'ramp').colors).toEqual(CLAY_RAMP);
    const { colors } = layerOf('resting', 'highlight');
    expect(Math.max(...colors.map(alphaOf))).toBe(0.12);
    for (const color of colors) {
      expect(tintOf(color)).toBe(ROSE_TINT);
    }
  });

  it('stops every ramp at 0, 46% and 100%', () => {
    for (const name of GROUND_NAMES) {
      expect(layerOf(name, 'ramp').locations).toEqual([0, 0.46, 1]);
    }
  });

  it('lays the same top scrim over every ground', () => {
    for (const name of GROUND_NAMES) {
      const scrim = layerOf(name, 'scrim');
      expect(scrim.colors).toEqual(SCRIM_COLORS);
      expect(scrim.locations).toEqual([0, 0.26, 0.54, 1]);
    }
  });

  // One value for every screen with nothing to decide, sign-in included, so
  // they can't drift apart. `resting` is also the entrance's ground, which is
  // why the two names must never diverge by accident. (TAC-364, TAC-384.)
  it('uses one clay for every resting screen and for sign-in', () => {
    expect(GROUNDS.auth).toBe(GROUNDS.resting);
  });
});

describe('grounds — the RN approximations', () => {
  it.each(GROUND_NAMES)(
    '%s draws its ramp at 168° through the centre of the design frame',
    (name) => {
      const ramp = layerOf(name, 'ramp');
      expect(Math.abs(cssDegrees(ramp) - 168)).toBeLessThan(0.1);
      expect((ramp.start.x + ramp.end.x) / 2).toBeCloseTo(0.5, 3);
      expect((ramp.start.y + ramp.end.y) / 2).toBeCloseTo(0.5, 3);
    },
  );

  // The previous endpoints were computed in unit space and drew about 6° off
  // vertical instead of 12°.
  it('draws the entrance veil at the same angle', () => {
    expect(Math.abs(cssDegrees(VEIL_GROUND.layers[0]) - 168)).toBeLessThan(0.1);
  });

  // Spec geometry: centre 55%, reach 0.62 of the height. At the top edge the
  // radial is 0.55 from its centre and at the bottom 0.45, so it hasn't reached
  // zero at either. A stop clamped to transparent at the edge cuts the highlight
  // off below the card, which is the brightening the geometry exists for.
  it('carries the highlight to both edges at the alpha the radial has there', () => {
    const { colors, locations } = layerOf('midThread', 'highlight');
    expect(locations).toEqual([0, 0, 0.55, 1, 1]);
    expect(alphaOf(colors[0])).toBeCloseTo(0.26 * (1 - 0.55 / 0.62), 3);
    expect(alphaOf(colors[2])).toBe(0.26);
    expect(alphaOf(colors[4])).toBeCloseTo(0.26 * (1 - 0.45 / 0.62), 3);
  });
});
