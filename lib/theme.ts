/**
 * Non-color design tokens. Colors and palette tokens live in
 * `tailwind.config.js`; gradients live in `lib/grounds.ts`. Anything that needs
 * a numeric value (gesture thresholds, durations, easings, sizes, letter
 * spacing) lives here.
 *
 * Values below are transcribed from `design_handoff_operator_redesign/README.md`
 * against a 402 x 874 reference screen. Letter-spacing is load-bearing in this
 * design — a tracked-caps label at 9.5px/2.4 reads nothing like the same label
 * at 0 — so tracking is a first-class token, not a magic number at the call site.
 */

export const swipe = {
  commitThresholdPx: 80,
  velocityCommitPxPerSec: 800,
  intensityDivisorPx: 140,
  rotationFactor: 0.04,
  flyOffTranslateXPx: 440,
  flyOffRotationDeg: 8,
  /**
   * Also the commit delay. The design's "the card flies to ±440px and the
   * action fires 250ms later" is implemented as the fly-off animation's own
   * completion callback rather than a parallel `setTimeout`, so the two can't
   * drift and there's no timer to leak on unmount. The refusal decision still
   * happens on the UI thread before any fly-off starts, so delaying the commit
   * does not reopen TAC-312.
   */
  flyOffDurationMs: 250,
  springBackDurationMs: 220,
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
  /** The drain bar animates scaleX 1 -> 0 over exactly the dismiss window. If
   *  these ever disagree the bar lies about how much time is left. */
  drainDurationMs: 3_000,
  drainHeightPx: 2,
} as const;

export const ground = {
  crossfadeDurationMs: 320,
} as const;

/**
 * The queue card. Height is fixed so every card is the same size regardless of
 * how many messages it holds — see `resolveCardLayout` in
 * `components/queue/queue-card-stack.tsx` for what happens when 560 doesn't fit.
 */
export const card = {
  heightPx: 560,
  /** Below this the card stops shrinking and starts borrowing from the hint
   *  row's reserve instead. */
  minHeightPx: 440,
  radiusPx: 20,
  /** `padding: 0 26px` on the deck container. */
  screenInsetPx: 26,
  /** `padding-bottom: 96px` — what reserves the pinned hint row's space. */
  hintReservePx: 96,
  hintReserveMinPx: 60,
  /** Regions b/c/d share a 20px horizontal inset. */
  regionInsetPx: 20,
  bubbleGapPx: 6,
  bubbleMaxWidthPct: 78,
} as const;

/**
 * The two peek cards behind the front card. These are blank white slabs, not
 * rendered cards — the design shows only a tinted edge of each.
 *
 * `baseOpacity` is the resting white alpha; `dragGain` is how much it brightens
 * at full drag intensity. Rendering them as a pure-white view at `opacity`
 * is equivalent to filling with `rgba(255,255,255,alpha)` and animates on the
 * GPU instead of re-resolving a color every frame.
 */
export const peek = {
  near: { translateYPx: 15, scaleX: 0.93, baseOpacity: 0.55, dragGain: 0.35 },
  far: { translateYPx: 30, scaleX: 0.86, baseOpacity: 0.26, dragGain: 0.16 },
} as const;

/** The swipe hint row, pinned to the screen rather than to the card. */
export const hint = {
  restSizePx: 10,
  /** The hint being dragged toward grows; the opposite one dims. */
  activeSizePx: 13,
  restColor: '#FFFFFF',
  dimmedColor: 'rgba(255,255,255,0.45)',
  /** "Send ->" when there is no draft: permanently unavailable, not just dim. */
  disabledColor: 'rgba(255,255,255,0.35)',
} as const;

/**
 * White text sitting directly on a ground.
 *
 * One alpha for body copy, deliberately. The design specifies 0.8 for the
 * Texts preview line, but 0.8 misses 4.5:1 against every type ground — 3.98:1
 * on neutral even after the highlight was dropped to 0.10. 0.92 clears it at
 * 4.67:1, and using the same value everywhere means there is one number to
 * check rather than two. Chrome (the help footer, the escape hatch) stays at
 * the design's 0.85: it is tracked caps at 9.5px, not reading material.
 */
export const groundText = {
  body: 'rgba(255,255,255,0.92)',
  chrome: 'rgba(255,255,255,0.85)',
} as const;

export const nav = {
  hairlineColor: 'rgba(255,255,255,0.16)',
  activeColor: '#FFFFFF',
  inactiveColor: 'rgba(255,255,255,0.78)',
  tabPaddingBottomPx: 7,
  horizontalInsetPx: 26,
  topInsetPx: 20,
} as const;

/**
 * Geometry the mock hardcodes that the implementation has to derive.
 *
 * The mock is drawn against a fixed iPhone 16 Pro frame, so its `top: 62px` and
 * `bottom: 46px` already contain the safe-area insets. Real screens read the
 * insets and add only the spacing below.
 */
export const layout = {
  mockTopInsetPx: 62,
  mockHomeIndicatorPx: 34,
  /** mock `bottom: 46` = 34 indicator + 12 real spacing. */
  hintRowGapPx: 12,
  /** mock `padding-bottom: 40` = 34 + 6. */
  footerGapPx: 6,
  /** mock `bottom: 40` on the undo toast. */
  toastGapPx: 6,
} as const;

/**
 * Tracked-caps presets, keyed by role. `<TrackedCaps {...typePresets.navTab}>`.
 *
 * Every one of these is uppercase, weight 500. Spreading a named preset keeps
 * the size/tracking pair together — they were tuned as a pair and reading one
 * without the other tells you nothing.
 */
export const typePresets = {
  navTab: { size: 11, tracking: 2.4 },
  navCount: { size: 11, tracking: 1.2 },
  flagReason: { size: 9.5, tracking: 2.6, lineHeight: 14 },
  flagCounter: { size: 9, tracking: 2.2 },
  cardName: { size: 12.5, tracking: 1.6 },
  badge: { size: 8, tracking: 1.5 },
  elapsed: { size: 9, tracking: 1.9 },
  dateDivider: { size: 8.5, tracking: 2.2 },
  composerCaption: { size: 8.5, tracking: 1.9 },
  hint: { size: 10, tracking: 2.4 },
  footer: { size: 9.5, tracking: 1.7 },
  cta: { size: 11.5, tracking: 2.6 },
  link: { size: 9.5, tracking: 2.2 },
  screenMeta: { size: 9.5, tracking: 2.4 },
  filterPill: { size: 9.5, tracking: 1.8 },
  rowName: { size: 12.5, tracking: 1.4 },
  rowTime: { size: 9, tracking: 1.8 },
  statePill: { size: 8.5, tracking: 1.8 },
  settingLabel: { size: 11, tracking: 2.2 },
  settingValue: { size: 10, tracking: 1.8 },
  undoAction: { size: 9.5, tracking: 2.2 },
} as const;

/** Editorial display — Fraunces italic. Titles only, one per screen. */
export const display = {
  screenTitle: { size: 30, lineHeight: 35, tracking: -0.4 },
  authTitle: { size: 34, lineHeight: 41, tracking: -0.4 },
  emptyTitle: { size: 32, lineHeight: 38, tracking: 0 },
} as const;

/** Body — Inter Tight 400. Message bodies, reasoning, previews. */
export const body = {
  bubble: { size: 13.5, lineHeight: 19 },
  reasoning: { size: 12.5, lineHeight: 19 },
  preview: { size: 12.5, lineHeight: 18 },
  authSubtitle: { size: 13.5, lineHeight: 20 },
} as const;

export const easing = {
  /** cubic-bezier(.2,.8,.2,1) — used for all major transitions in the design */
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

// Thread render constants — ported from analog-guest's conversation-thread.tsx
// (computeItems + render). `sequenceGapMs`: same-direction messages within this
// window collapse into a chain without bubble tails between them.
// `timestampGapMs`: insert a centered timestamp row when consecutive messages
// span more than this. `nearBottomPx`: auto-scroll on Realtime insert only
// when the operator is within this distance of the bottom (don't yank the
// view mid-read). (TAC-290.)
export const thread = {
  sequenceGapMs: 60_000,
  timestampGapMs: 5 * 60_000,
  nearBottomPx: 120,
} as const;

// Conversations tab: the window (in minutes since last message) inside
// which a conversation counts as "active" — drives the pulsing-dot render
// and the Active filter pill. Mirrors the imported design's default.
export const conversations = {
  activeWindowMins: 60,
} as const;
