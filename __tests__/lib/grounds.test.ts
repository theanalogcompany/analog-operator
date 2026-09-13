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

  it('still aliases neutral to stone and auth to clay', () => {
    // When the color exercise gives these their own identity this test is the
    // thing that should fail, prompting a decision rather than a silent drift.
    expect(GROUNDS.neutral).toBe(GROUNDS.queueStone);
    expect(GROUNDS.auth).toBe(GROUNDS.queueClay);
  });
});
