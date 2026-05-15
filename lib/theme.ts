/**
 * Motion constants lifted from docs/prototypes/analog_operator_app_demo.html.
 * Colors and palette tokens live in tailwind.config.js. Anything that needs
 * a numeric value (gesture thresholds, durations, easings, sizes) lives here.
 */

export const swipe = {
  commitThresholdPx: 80,
  velocityCommitPxPerSec: 800,
  intensityDivisorPx: 140,
  rotationFactor: 0.04,
  flyOffTranslateXPx: 440,
  flyOffRotationDeg: 8,
  flyOffDurationMs: 250,
  advanceDelayMs: 240,
  springBackDurationMs: 200,
  residualRotationDeg: 0.3,
} as const;

export const editTakeover = {
  slideInDurationMs: 300,
  slideOutDurationMs: 250,
  sendAdvanceDelayMs: 280,
} as const;

export const undoToast = {
  windowMs: 3_000,
  fadeOutDurationMs: 180,
} as const;

export const peekCard = {
  topOffsetPx: 8,
  scale: 0.965,
  opacity: 0.55,
} as const;

export const easing = {
  /** cubic-bezier(.2,.8,.2,1) — used for all major transitions in the prototype */
  emphasizedDecelerate: [0.2, 0.8, 0.2, 1] as const,
};

export const recognition = {
  stateLabels: {
    new: 'New',
    returning: 'Returning',
    regular: 'Regular',
    raving_fan: 'Raving Fan',
  } as const,
};
