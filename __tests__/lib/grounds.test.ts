import { GROUNDS, GROUND_NAMES, type GroundName } from '@/lib/grounds';

/**
 * These colors are placeholders pending a separate color exercise, so nothing
 * here asserts a hex value — that would just have to be rewritten the day the
 * real palette lands, which is exactly the churn `lib/grounds.ts` exists to
 * prevent.
 *
 * What IS worth locking is the structure the swap has to preserve: five named
 * roles, every one renderable, and the two aliases still pointing somewhere.
 */
describe('grounds', () => {
  it('declares all five roles', () => {
    expect(GROUND_NAMES).toEqual([
      'queueClay',
      'queueStone',
      'queueInk',
      'neutral',
      'auth',
    ]);
  });

  it('defines every declared role', () => {
    for (const name of GROUND_NAMES) {
      expect(GROUNDS[name]).toBeDefined();
    }
  });

  it('has no ground the names list forgot', () => {
    expect(Object.keys(GROUNDS).sort()).toEqual([...GROUND_NAMES].sort());
  });

  it.each(GROUND_NAMES)('%s is renderable', (name: GroundName) => {
    const ground = GROUNDS[name];
    expect(ground.layers.length).toBeGreaterThan(0);
    for (const layer of ground.layers) {
      // expo-linear-gradient needs two stops minimum, and one `locations`
      // entry per color when locations are given at all.
      expect(layer.colors.length).toBeGreaterThanOrEqual(2);
      if (layer.locations) {
        expect(layer.locations.length).toBe(layer.colors.length);
      }
      for (const coord of [layer.start, layer.end]) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThanOrEqual(1);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThanOrEqual(1);
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

  // These two were aliases until the contrast numbers came in. The highlight
  // exists to make the white queue card pop off the ground — a queue job. On
  // the screens with no card, white type sits directly on the ground and the
  // highlight only washes it out: at 0.26 nothing, not even pure white, reaches
  // 4.5:1 at mid-screen. So the card grounds keep the full highlight and the
  // type grounds take a much quieter one. This divergence IS the reason there
  // are five names rather than three; collapsing them back would silently
  // reintroduce the contrast failure.
  it('separates the type grounds from the card grounds', () => {
    expect(GROUNDS.neutral).not.toBe(GROUNDS.queueStone);
    expect(GROUNDS.auth).not.toBe(GROUNDS.queueClay);
  });

  it('differs from its card ground only in the highlight', () => {
    const layerOf = (g: (typeof GROUNDS)[GroundName], role: string) =>
      g.layers.find((l) => l.role === role);
    for (const [type, cardGround] of [
      ['neutral', 'queueStone'],
      ['auth', 'queueClay'],
    ] as const) {
      // Same ramp, same scrim — only the highlight is quieter.
      expect(layerOf(GROUNDS[type], 'ramp')).toEqual(
        layerOf(GROUNDS[cardGround], 'ramp'),
      );
      expect(layerOf(GROUNDS[type], 'scrim')).toEqual(
        layerOf(GROUNDS[cardGround], 'scrim'),
      );
      expect(layerOf(GROUNDS[type], 'highlight')).not.toEqual(
        layerOf(GROUNDS[cardGround], 'highlight'),
      );
    }
  });
});
