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
  /**
   * Where rotation rests, before any swipe and after every spring-back. Zero:
   * cards sit square. The prototype's 0.3° resting tilt read as a crooked card
   * on device, and because a drag replaces it with `translationX × rotationFactor`,
   * nudging the card left seemed to straighten it. (TAC-388.)
   */
  residualRotationDeg: 0,
} as const;

export const editTakeover = {
  slideInDurationMs: 300,
  slideOutDurationMs: 250,
  sendAdvanceDelayMs: 280,
} as const;

export const undoToast = {
  windowMs: 3_000,
  fadeOutDurationMs: 180,
  /** The drain bar animates scaleX to 0 over whatever is LEFT of the dismiss
   *  window, measured from the record's `expires_at` rather than from a
   *  duration of its own — the toast can mount partway through its window when
   *  a venue switch remounts the queue screen (TAC-382), and a bar with its own
   *  fixed duration would restart full and lie about the time remaining.
   *  `windowMs` above is the full window and the bar's denominator. */
  drainHeightPx: 2,
} as const;

/**
 * The app's one ground-transition duration: the deck crossfading to the next
 * card's ground, and the card's ground arriving over clay during the cold-launch
 * entrance (`entrance.bucketDelayMs`). TAC-384 specified 420ms as that number
 * and kept a second token until the deck moved to it. (TAC-364.)
 */
export const ground = {
  crossfadeDurationMs: 420,
} as const;

/**
 * The cold-launch entrance — "Wick" (TAC-384).
 *
 * Every value is an ABSOLUTE offset from one clock started at boot, not a
 * per-layer delay — see lib/entrance.ts for why.
 *
 * The numbers are exact: the relationship between the mark's hold and the
 * ground's arrival IS the effect, and shifting either by 100ms changes what it
 * feels like. Do not round.
 */
export const entrance = {
  totalMs: 1_700,

  /**
   * The mark: in, hold, out. `markFadeInStop` and `markHoldStop` are the 38%
   * and 62% stops of the `om-mark` keyframes, as fractions of `markDurationMs`.
   *
   * These describe ONE ramp evaluated by one pure function, never two
   * animations on one value. Two animations with backwards fill is the defect
   * that shipped in the design file twice: the later one's 0% keyframe wins
   * during its delay and the fade-in never renders, so the mark hard-cuts to
   * full opacity on frame one. See `markOpacityAt` in `lib/entrance.ts`.
   */
  markDelayMs: 60,
  markDurationMs: 1_180,
  markFadeInStop: 0.38,
  markHoldStop: 0.62,
  markSizePx: 44,

  /** Veil out and clay in are the same 700ms window run in opposite
   *  directions, which is what makes the ground look lit rather than swapped. */
  groundDelayMs: 200,
  groundDurationMs: 700,

  /** The card's rise — the one non-opacity animation in the entrance. */
  cardDelayMs: 940,
  cardDurationMs: 560,
  cardRiseFromPx: 26,

  /**
   * The card's bucket ground crossfading over clay.
   *
   * Bound to the card's entrance (940ms, same instant as `cardDelayMs`) when the
   * queue resolves before it, never to the response — a fast fetch must not
   * produce two ground changes inside the entrance. A queue that resolves after
   * 940ms has missed the slot and takes the ordinary deck crossfade instead (see
   * `ridesEntranceClock`).
   *
   * Its duration is `ground.crossfadeDurationMs` (420ms), the app's one
   * ground-transition number, so the entrance's bucket fade and the deck's
   * crossfade cannot drift apart. TAC-384 specified 420 as that number, and
   * TAC-364 collapsed the two tokens into it.
   */
  bucketDelayMs: 940,

  navDelayMs: 960,
  navDurationMs: 400,

  peekNearDelayMs: 1_000,
  peekNearDurationMs: 420,
  peekFarDelayMs: 1_060,
  peekFarDurationMs: 420,

  hintsDelayMs: 1_320,
  hintsDurationMs: 360,

  /** `prefers-reduced-motion`: skip to the resolved state. No veil, no mark,
   *  no rise — "a cross-fade of 150ms at most" is the whole budget. */
  reducedMotionFadeMs: 150,
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
 * Texts preview line, but 0.8 missed 4.5:1 on the grounds it was drawn for, and
 * using one value everywhere means there is one number to check rather than
 * two. Chrome (the help footer, the escape hatch) stays at the design's 0.85: it
 * is tracked caps at 9.5px, not reading material. What both give on each ground
 * is computed by `__tests__/lib/ground-contrast.test.ts`, which checks them on
 * clay everywhere a line of text can sit. (TAC-364.)
 */
export const groundText = {
  body: 'rgba(255,255,255,0.92)',
  chrome: 'rgba(255,255,255,0.85)',
} as const;

/**
 * The pill behind a thread date divider on the edit takeover.
 *
 * The takeover's thread sits on the card's ground, and its dividers are white
 * at 0.92 in 8.5px tracked caps, which is not large text. Unbacked they miss
 * 4.5:1 on four of the five card grounds (Honey falls to 2.45:1), and they
 * already missed it on the stone and clay grounds before TAC-364. The colour is
 * the scrim's, at the lowest alpha that holds 4.5:1 anywhere on every card
 * ground; Honey sets it. `__tests__/lib/ground-contrast.test.ts` recomputes that
 * on every change. The Texts thread sits on clay, which clears 4.5:1 without
 * one, so it has no pill. (TAC-364.)
 */
export const dividerBacking = {
  color: 'rgba(26,16,10,0.35)',
  paddingHorizontalPx: 8,
  paddingVerticalPx: 3,
  radiusPx: 999,
} as const;

/** The "Chat with Jaipal" pill around its label. (TAC-388.) */
export const helpPill = {
  paddingHorizontalPx: 10,
  paddingVerticalPx: 5,
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
  /** The reply-window timer pill. Sits where the elapsed pill sits. (TAC-486.) */
  replyTimer: { size: 9, tracking: 1.7 },
  /** "1 / 3 cards for Mia", the sub-queue row. (TAC-486.) */
  subQueue: { size: 9.5, tracking: 1.5 },
  /** "COPY AND OPEN INSTAGRAM" on the expired card. (TAC-486.) */
  copyAction: { size: 9.5, tracking: 2.2 },
  /** "Before she edited it" / "What this replaced". (TAC-486.) */
  amendLabel: { size: 8.5, tracking: 1.9 },
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
  /** cubic-bezier(.25,.1,.25,1) — CSS `ease`; every opacity ramp in the cold-launch entrance */
  ease: [0.25, 0.1, 0.25, 1] as const,
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
// `nearBottomPx`: auto-scroll on Realtime insert only when the operator is
// within this distance of the bottom (don't yank the view mid-read).
//
// There is deliberately no gap constant for day separators. They mark calendar
// days, so a message's own date is the only input. The `timestampGapMs` this
// replaced started a fresh divider after every five-minute pause, which stacked
// several of them on one day. (TAC-290, TAC-408.)
export const thread = {
  sequenceGapMs: 60_000,
  nearBottomPx: 120,
} as const;

// Conversations tab: the window (in minutes since last message) inside
// which a conversation counts as "active" — drives the pulsing-dot render
// and the Active filter pill. Mirrors the imported design's default.
export const conversations = {
  activeWindowMins: 60,
} as const;

/**
 * The review detail: the reason sentence, the other triggers that fired, and
 * any claim the grounding check couldn't verify. Shown under the name on a draft
 * card and in the edit takeover's header. (TAC-364.)
 *
 * Every line is capped. The takeover's caps are not free to grow: its header
 * sits directly on the card's ground, and on Honey white text holds 4.5:1 only
 * in about the top third of the screen. `__tests__/lib/ground-contrast.test.ts`
 * adds these up with `takeoverHeader` against that limit, recomputed from
 * `lib/grounds.ts`, and fails if the header would run past it.
 */
export const reviewDetail = {
  lineHeightPx: body.reasoning.lineHeight,
  /** Between the parts, and above the first one. */
  gapPx: 8,
  /** Between the "ALSO" caps and the column of reasons beside it. */
  alsoPrefixGapPx: 8,
  /**
   * The Also block lists one reason per row: at most `alsoItems` rows, each
   * reason up to `alsoItemLines` lines. A reason that needs more is withheld,
   * not cut, and counted in a "+N more" row that takes the last slot, so the
   * block never runs past `alsoItems × alsoItemLines` lines. (TAC-388.)
   */
  card: { reasonLines: 2, alsoItems: 3, alsoItemLines: 2, claimLines: 3 },
  takeover: { reasonLines: 2, alsoItems: 2, alsoItemLines: 1, claimLines: 1, reasoningLines: 1 },
} as const;

/**
 * The edit takeover's header above the review detail. Named rather than
 * inlined because the contrast budget in `reviewDetail`'s test reads the same
 * numbers the screen lays out with.
 */
export const takeoverHeader = {
  rowPaddingTopPx: 14,
  /** Sets the height of the top row: the badge and the back link are shorter. */
  nameLineHeightPx: 18,
  blockPaddingTopPx: 18,
  blockPaddingBottomPx: 18,
  blockPaddingHorizontalPx: 22,
} as const;

/**
 * Instagram's reply window: the drain bar, the timer pill and the expired
 * card's treatment. Sizes are the design hand-off's CSS px, which map 1:1 to
 * RN points. (TAC-486.)
 *
 * Colours live here rather than in `lib/grounds.ts` because none of them is a
 * ground or a strip: they are ink and fills on the white card surface, which is
 * what the rest of this file holds.
 */
export const replyWindow = {
  /** A1: full card width, directly under the flag strip. */
  bar: {
    heightPx: 6,
    trackColor: 'rgba(28,24,20,0.10)',
    /** So a nearly spent window is still visible rather than a hairline. */
    minFillPx: 8,
    /** Left-aligned, so only the right corners are rounded. */
    fillRadiusPx: 3,
    /**
     * A recompute animates; a mount does not. The bar appearing already full
     * and then sliding would read as the window refilling.
     */
    animateMs: 300,
  },
  /**
   * The Instagram gradient, at the hand-off's stops. Spans the FILLED width,
   * not the track, so a short bar still shows every colour rather than fading
   * out in the yellows.
   *
   * It is the same in every live state: only the length changes. That is what
   * lets the bar say "Instagram owns this deadline" as well as "this much is
   * left", and it is why the glyph beside the handle is monochrome (a second
   * gradient on one card would compete with the bucket strip).
   */
  gradient: {
    colors: ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'] as const,
    locations: [0, 0.25, 0.55, 0.8, 1] as const,
    start: { x: 0, y: 0.5 } as const,
    end: { x: 1, y: 0.5 } as const,
  },
  /**
   * A2: the pill, in the head row where the elapsed pill sits on a text card.
   *
   * The escalation is three things at once, deliberately: the unit gets finer
   * (18h, then 4h 20m, then 42m), the chip gains a border and then a clay fill,
   * and under an hour the word "Urgent" appears in the label itself. Colour is
   * the last of the three and never the only one, so the state survives a
   * screen in sunlight and an operator who cannot use the hue.
   */
  pill: {
    paddingVerticalPx: 4,
    paddingHorizontalPx: 10,
    radiusPx: 999,
    borderWidthPx: 1,
  },
  /** One row per `ReplyWindowState['kind']` that draws a pill. */
  pillColors: {
    plenty: { bg: 'transparent', border: 'transparent', ink: '#6F6658' },
    close: { bg: 'transparent', border: 'rgba(28,24,20,0.28)', ink: '#1C1814' },
    urgent: { bg: '#A85638', border: '#A85638', ink: '#FFFFFF' },
    closed: { bg: '#1C1814', border: '#1C1814', ink: '#FFFFFF' },
  },
  /**
   * A4: the expired card. The surface stays white; what changes is the ink and
   * the chrome, so the draft and the thread stay readable and selectable.
   */
  expired: {
    metaInk: '#635B4E',
    avatarBg: 'rgba(28,24,20,0.10)',
    chipBorder: 'rgba(28,24,20,0.28)',
    inboundBubble: '#DFD5C1',
    outboundBubble: '#FBF8F2',
    outboundBorder: 'rgba(28,24,20,0.14)',
    /** The copy block that replaces the composer. */
    rule: 'rgba(28,24,20,0.12)',
    draftBoxBorder: 'rgba(28,24,20,0.26)',
    draftBoxRadiusPx: 14,
    draftInk: '#4A4339',
    buttonBg: '#1C1814',
    buttonRadiusPx: 999,
    iconSizePx: 13,
  },
} as const;

/**
 * The sub-queue row: "1 / 3 cards for Mia", shown when the deck holds more than
 * one pending card for the same guest. (TAC-486, C1.)
 */
export const subQueue = {
  paddingVerticalPx: 8,
  paddingHorizontalPx: 11,
  radiusPx: 8,
  backgroundColor: 'rgba(28,24,20,0.05)',
  gapPx: 9,
  ink: '#4A4339',
  segment: {
    widthPx: 13,
    heightPx: 3,
    radiusPx: 2,
    gapPx: 3,
    /** The card you are on. */
    onColor: '#A85638',
    offColor: 'rgba(28,24,20,0.22)',
  },
} as const;

/**
 * Instagram identity on a card, a row and a thread header. (TAC-486, B.)
 *
 * The glyph is monochrome and tinted to the surrounding ink, never the
 * full-colour logo: the drain bar already carries Instagram's gradient and a
 * second one on the same card would compete with the bucket strip.
 */
export const instagramIdentity = {
  avatarSizePx: 32,
  avatarBg: 'rgba(28,24,20,0.08)',
  avatarInk: '#4A4339',
  /** On a gradient ground (the thread header) rather than the white card. */
  avatarBgOnGround: 'rgba(255,255,255,0.2)',
  glyph: {
    cardSizePx: 12,
    rowSizePx: 11,
  },
  handle: {
    sizePx: 10.5,
    trackingPx: 0.2,
    underline: 'rgba(28,24,20,0.3)',
    underlineOnGround: 'rgba(255,255,255,0.6)',
    arrowSizePx: 8,
    gapPx: 4,
    pressedOpacity: 0.6,
    hitSlopPx: 8,
  },
  /** An unnamed guest's name line is the handle, in its own case. */
  handleAsNameTrackingPx: 0.2,
} as const;
