import {
  __resetEntranceStateForTests,
  cardRiseAt,
  consumeColdLaunch,
  easeAt,
  fadeInAt,
  fadeOutAt,
  markOpacityAt,
  resolveEntranceMode,
  ridesEntranceClock,
} from '@/lib/entrance';
import { entrance } from '@/lib/theme';

/**
 * The entrance's ramps, tested as the pure functions they are.
 *
 * Per CLAUDE.md/TAC-312: the behaviour lives in the animation layer, so the
 * test has to exercise that layer. These are the actual functions the
 * `useAnimatedStyle` callbacks call — not a re-implementation of them, and not
 * a component with the animation mocked away.
 */

const mark = (elapsedMs: number): number =>
  markOpacityAt({
    elapsedMs,
    delayMs: entrance.markDelayMs,
    durationMs: entrance.markDurationMs,
    fadeInStop: entrance.markFadeInStop,
    holdStop: entrance.markHoldStop,
  });

const ground = (elapsedMs: number): number =>
  fadeInAt({
    elapsedMs,
    delayMs: entrance.groundDelayMs,
    durationMs: entrance.groundDurationMs,
  });

const veil = (elapsedMs: number): number =>
  fadeOutAt({
    elapsedMs,
    delayMs: entrance.groundDelayMs,
    durationMs: entrance.groundDurationMs,
  });

const bucket = (elapsedMs: number): number =>
  fadeInAt({
    elapsedMs,
    delayMs: entrance.bucketDelayMs,
    durationMs: entrance.bucketDurationMs,
  });

const rise = (elapsedMs: number): { opacity: number; translateY: number } =>
  cardRiseAt({
    elapsedMs,
    delayMs: entrance.cardDelayMs,
    durationMs: entrance.cardDurationMs,
    fromPx: entrance.cardRiseFromPx,
  });

const MARK_END_MS = entrance.markDelayMs + entrance.markDurationMs;

describe('the mark', () => {
  /**
   * THE acceptance criterion, and the defect the design file shipped twice.
   *
   * In CSS it was two animations on one property with backwards fill: the later
   * one's 0% keyframe won during its delay, the fade-in never rendered, and the
   * mark hard-cut to full opacity on frame one. The Reanimated equivalent is
   * two `withDelay` chains writing one shared value.
   *
   * `markOpacityAt` cannot express that bug — it is one function over one clock
   * whose first branch is `x <= 0 -> 0` — and this is the assertion that says
   * so out loud.
   */
  it('is 0 at t=0, not 1', () => {
    expect(mark(0)).toBe(0);
  });

  it('stays dark through its own delay and starts from nothing', () => {
    expect(mark(entrance.markDelayMs - 1)).toBe(0);
    expect(mark(entrance.markDelayMs)).toBe(0);
    expect(mark(entrance.markDelayMs + 1)).toBeGreaterThan(0);
  });

  it('ramps in rather than cutting in', () => {
    // A hard cut would read as 1 (or very near it) a frame or two after the
    // delay. A ramp is still nowhere near full a tenth of the way through.
    expect(mark(120)).toBeLessThan(0.5);
    expect(mark(300)).toBeGreaterThan(0);
    expect(mark(300)).toBeLessThan(1);
  });

  it('rises monotonically to full by its fade-in stop', () => {
    const samples = [60, 120, 200, 300, 400, 500].map(mark);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
    const fadeInEnd =
      entrance.markDelayMs + entrance.markDurationMs * entrance.markFadeInStop;
    expect(mark(fadeInEnd)).toBeCloseTo(1, 2);
  });

  it('holds at full between its stops', () => {
    const holdStart =
      entrance.markDelayMs + entrance.markDurationMs * entrance.markFadeInStop;
    const holdEnd =
      entrance.markDelayMs + entrance.markDurationMs * entrance.markHoldStop;
    expect(mark(holdStart + 1)).toBe(1);
    expect(mark((holdStart + holdEnd) / 2)).toBe(1);
    expect(mark(holdEnd - 1)).toBe(1);
  });

  it('falls monotonically back to nothing and stays there', () => {
    const samples = [800, 900, 1000, 1100, 1200].map(mark);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
    expect(mark(MARK_END_MS)).toBe(0);
    expect(mark(entrance.totalMs)).toBe(0);
    // It does not come back.
    expect(mark(10_000)).toBe(0);
  });
});

describe('the veil and the ground', () => {
  it('starts opaque over an invisible ground', () => {
    expect(veil(0)).toBe(1);
    expect(ground(0)).toBe(0);
  });

  it('holds both until the ground window opens', () => {
    expect(veil(entrance.groundDelayMs)).toBe(1);
    expect(ground(entrance.groundDelayMs)).toBe(0);
  });

  it('crosses in opposite directions over one window', () => {
    const mid = entrance.groundDelayMs + entrance.groundDurationMs / 2;
    expect(veil(mid)).toBeLessThan(1);
    expect(veil(mid)).toBeGreaterThan(0);
    expect(ground(mid)).toBeLessThan(1);
    expect(ground(mid)).toBeGreaterThan(0);
    // Same eased curve, mirrored: the veil leaves exactly as fast as the ground
    // arrives. What shows through the partly-transparent middle is the
    // underlay, asserted in __tests__/components/ground/ground-screen.test.tsx.
    expect(veil(mid) + ground(mid)).toBeCloseTo(1, 6);
  });

  it('ends with the ground alone', () => {
    const end = entrance.groundDelayMs + entrance.groundDurationMs;
    expect(veil(end)).toBe(0);
    expect(ground(end)).toBe(1);
    expect(veil(entrance.totalMs)).toBe(0);
    expect(ground(entrance.totalMs)).toBe(1);
  });
});

describe('the card', () => {
  it('is absent and offset before its slot', () => {
    expect(rise(0)).toEqual({ opacity: 0, translateY: entrance.cardRiseFromPx });
    expect(rise(entrance.cardDelayMs)).toEqual({
      opacity: 0,
      translateY: entrance.cardRiseFromPx,
    });
  });

  it('resolves to in-place and fully opaque', () => {
    const end = entrance.cardDelayMs + entrance.cardDurationMs;
    expect(rise(end)).toEqual({ opacity: 1, translateY: 0 });
  });

  it('drives opacity and offset from one ramp, so they cannot disagree', () => {
    const mid = entrance.cardDelayMs + entrance.cardDurationMs / 2;
    const { opacity, translateY } = rise(mid);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    // translateY is the same eased value, expressed as remaining distance.
    expect(translateY).toBeCloseTo(entrance.cardRiseFromPx * (1 - opacity), 6);
  });

  /**
   * The deck only mounts once the queue resolves, which can be long after the
   * card's window. A mount-driven rise would start two seconds late; this reads
   * the clock instead, finds the window gone, and renders the card in place.
   *
   * This is "if data arrives late, do not replay" as an assertion.
   */
  it('renders a late-arriving card resolved instead of replaying its rise', () => {
    expect(rise(2_000)).toEqual({ opacity: 1, translateY: 0 });
    expect(rise(30_000)).toEqual({ opacity: 1, translateY: 0 });
  });
});

describe('the bucket ground crossfade', () => {
  /**
   * The ticket's sharpest requirement: "bind the crossfade to the card's
   * entrance, never to the response." A fast fetch must not produce two ground
   * changes inside the entrance.
   *
   * Structurally, the bucket shares the card's offset and reads the same clock.
   * A queue that resolves after that offset takes the ordinary crossfade
   * instead; that decision lives in GroundScreen and is tested there.
   */
  it('starts with the card, not with the response', () => {
    expect(entrance.bucketDelayMs).toBe(entrance.cardDelayMs);
    expect(bucket(entrance.bucketDelayMs - 1)).toBe(0);
    expect(bucket(entrance.bucketDelayMs)).toBe(0);
    expect(bucket(entrance.bucketDelayMs + 1)).toBeGreaterThan(0);
  });

  it('is clay alone for the whole first second', () => {
    // Whatever the queue returns and however fast, nothing but clay is on
    // screen until the card's slot opens.
    for (const t of [0, 100, 300, 500, 700, 900]) {
      expect(bucket(t)).toBe(0);
    }
  });

  it('completes within the entrance', () => {
    const end = entrance.bucketDelayMs + entrance.bucketDurationMs;
    expect(bucket(end)).toBe(1);
    expect(end).toBeLessThanOrEqual(entrance.totalMs);
  });
});

describe('ramp clamping', () => {
  it('never leaves 0..1', () => {
    for (const t of [-5_000, -1, 0, 1, 500, 940, 1_700, 5_000]) {
      for (const value of [mark(t), ground(t), veil(t), bucket(t)]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(rise(t).opacity).toBeGreaterThanOrEqual(0);
      expect(rise(t).opacity).toBeLessThanOrEqual(1);
    }
  });

  it('eases without overshooting', () => {
    // CSS `ease` has no overshoot; a bad bezier solve shows up here first.
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const y = easeAt(x);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
    expect(easeAt(0)).toBe(0);
    expect(easeAt(1)).toBe(1);
    expect(easeAt(0.5)).toBeCloseTo(0.8, 1);
  });
});

/**
 * Transcribed from TAC-384's timing table, NOT read back off `lib/theme.ts`.
 *
 * The ticket says to read the table as exact: the relationship between the
 * mark's hold and the ground's arrival IS the effect, and shifting either by
 * 100ms changes what it feels like. A test that re-derived these from the code
 * would agree with any value at all.
 */
describe('the timing table', () => {
  it('matches the design exactly', () => {
    expect(entrance.markDelayMs).toBe(60);
    expect(entrance.markDurationMs).toBe(1180);
    expect(entrance.markFadeInStop).toBe(0.38);
    expect(entrance.markHoldStop).toBe(0.62);

    expect(entrance.groundDelayMs).toBe(200);
    expect(entrance.groundDurationMs).toBe(700);

    expect(entrance.cardDelayMs).toBe(940);
    expect(entrance.cardDurationMs).toBe(560);
    expect(entrance.cardRiseFromPx).toBe(26);

    expect(entrance.bucketDelayMs).toBe(940);
    expect(entrance.bucketDurationMs).toBe(420);

    expect(entrance.navDelayMs).toBe(960);
    expect(entrance.navDurationMs).toBe(400);

    expect(entrance.peekNearDelayMs).toBe(1000);
    expect(entrance.peekNearDurationMs).toBe(420);
    expect(entrance.peekFarDelayMs).toBe(1060);
    expect(entrance.peekFarDurationMs).toBe(420);

    expect(entrance.hintsDelayMs).toBe(1320);
    expect(entrance.hintsDurationMs).toBe(360);

    expect(entrance.totalMs).toBe(1700);
    expect(entrance.markSizePx).toBe(44);
  });

  it('is interactive by 1.5s and over by 1.7s', () => {
    // The ticket's own arithmetic: the card is in place at 940 + 560.
    expect(entrance.cardDelayMs + entrance.cardDurationMs).toBe(1500);
    // Nothing starts after the last layer finishes.
    expect(entrance.hintsDelayMs + entrance.hintsDurationMs).toBeLessThanOrEqual(
      entrance.totalMs,
    );
  });

  it('keeps reduced motion inside its 150ms budget', () => {
    expect(entrance.reducedMotionFadeMs).toBeLessThanOrEqual(150);
  });
});

describe('consumeColdLaunch', () => {
  beforeEach(() => {
    __resetEntranceStateForTests();
  });

  /**
   * The flag is module-scoped precisely so a remount cannot re-arm it. On this
   * app a screen mount is nowhere near a cold launch: `FrontCard` is keyed on
   * `messageId` so it remounts on every swipe, the tab row is `router.replace`
   * between sibling stacks so the queue remounts on every tab return, and a
   * venue switch remounts it too.
   */
  it('is true exactly once per process', () => {
    expect(consumeColdLaunch()).toBe(true);
    expect(consumeColdLaunch()).toBe(false);
    expect(consumeColdLaunch()).toBe(false);
  });
});

describe('resolveEntranceMode', () => {
  it('plays the full entrance on a cold launch', () => {
    expect(
      resolveEntranceMode({ coldLaunch: true, signedIn: true, reducedMotion: false }),
    ).toBe('full');
  });

  it('reduces the entrance when the operator asked for less motion', () => {
    expect(resolveEntranceMode({ coldLaunch: true, signedIn: true, reducedMotion: true })).toBe(
      'reduced',
    );
  });

  it('plays nothing when this is not a cold launch', () => {
    // Resume from background, a tab switch, a venue switch, and the queue
    // after signing in all land here.
    expect(
      resolveEntranceMode({ coldLaunch: false, signedIn: true, reducedMotion: false }),
    ).toBe('off');
  });

  it('prefers off over reduced — there is nothing to reduce', () => {
    expect(
      resolveEntranceMode({ coldLaunch: false, signedIn: true, reducedMotion: true }),
    ).toBe('off');
  });
});

describe('resolveEntranceMode — signed out', () => {
  /**
   * The sign-in screen draws its own mark, so an entrance over it shows two
   * logos. Signed out plays nothing, whatever reduced motion says. (Decided
   * 2026-09-14, reversing an earlier call to play it on sign-in.)
   */
  it('plays nothing on a signed-out cold launch', () => {
    expect(
      resolveEntranceMode({ coldLaunch: true, signedIn: false, reducedMotion: false }),
    ).toBe('off');
    expect(
      resolveEntranceMode({ coldLaunch: true, signedIn: false, reducedMotion: true }),
    ).toBe('off');
  });
});

describe('ridesEntranceClock', () => {
  it('rides a slot that has not begun', () => {
    expect(
      ridesEntranceClock({ elapsedMs: 0, slotStartMs: entrance.bucketDelayMs }),
    ).toBe(true);
    expect(
      ridesEntranceClock({ elapsedMs: 300, slotStartMs: entrance.bucketDelayMs }),
    ).toBe(true);
  });

  it('still rides at the boundary, where the ramp is at zero', () => {
    expect(
      ridesEntranceClock({
        elapsedMs: entrance.bucketDelayMs,
        slotStartMs: entrance.bucketDelayMs,
      }),
    ).toBe(true);
  });

  /**
   * The slow-fetch case. A queue that lands at 1.2s has missed the card's 940ms
   * slot; riding it would mount the bucket ground nearly opaque over clay, a
   * hard cut. It takes the ordinary crossfade instead, and the card appears in
   * place.
   */
  it('does not ride a slot that has already begun', () => {
    expect(
      ridesEntranceClock({ elapsedMs: 941, slotStartMs: entrance.bucketDelayMs }),
    ).toBe(false);
    expect(
      ridesEntranceClock({ elapsedMs: 1_200, slotStartMs: entrance.cardDelayMs }),
    ).toBe(false);
  });
});
