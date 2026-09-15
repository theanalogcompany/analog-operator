# Handoff: Operator App Redesign

## Overview

A full redesign of the Analog operator app — the phone app cafe and restaurant
staff use to review AI-drafted SMS replies before they go to guests. The
redesign covers every screen in the current app: sign-in, verify, the review
queue, the edit takeover, the sent/undo state, the empty queue, the texts list,
a text thread, and the account screen.

The core interaction changed. The current app reviews drafts in a scrolling list
of cards with buttons. The redesign is a **swipe deck**: one full guest
conversation per card, swipe right to send the draft, swipe left to write your
own. The background of the screen is a full-bleed gradient whose color encodes
**why the message was flagged**, so an operator knows what kind of decision is in
front of them before reading a word.

## About the design files

The files in this bundle are **design references created in HTML**. They are
prototypes showing intended look and behavior — not production code to copy.

The target codebase is the existing **Expo / React Native app**
(`theanalogcompany/analog-operator`, branch `main`): expo-router file routes
under `app/`, components under `components/`, NativeWind with the palette in
`tailwind.config.js`, fixtures in `lib/fixtures/`. Recreate these designs there
using its established patterns. Do not introduce a web renderer, and do not port
the HTML/CSS literally — translate it (see "Translating to React Native").

## Fidelity

**High fidelity.** Colors, type, spacing, radii, shadows and motion values below
are final and exact, with one explicit exception:

> **The gradient background colors are NOT final.** The three grounds in
> "Design tokens" are placeholders pending a separate color exercise. Implement
> them as **named tokens in one place** (e.g. `lib/grounds.ts`) so all five
> values can be swapped without touching a screen. Everything else — the layer
> structure of each ground, which state gets which ground, the contrast
> requirement on white text — is final.

## Device geometry

All measurements are in logical px against a **402 × 874** screen (iPhone 16 Pro).
Use safe-area insets in the implementation; the mock hardcodes their effect.

- Top inset: `62px` of padding above all app chrome.
- Bottom: content clears the home indicator by `34px` minimum. Where the mock
  says `bottom:46px` or `padding-bottom:58px`, that is the 34px indicator
  allowance plus real spacing — keep the visual gap, derive the inset.

## Typography

Two families, both already reasonable to load via `expo-font`.

| Role | Family | Usage |
| --- | --- | --- |
| Display | **Fraunces**, italic, weight 400 | Screen titles, empty state, guest names in editorial contexts |
| UI | **Inter Tight**, weights 400 / 500 / 600 | Everything else |

The type system has three recurring treatments. Apply them consistently:

1. **Tracked caps** — uppercase, weight 500, letter-spacing 1.4–2.6px, size
   8–12.5px. Used for every label, tab, badge, meta line, and action. This is
   the app's voice.
2. **Editorial display** — Fraunces italic, 20–34px, letter-spacing -0.4px on
   sizes ≥30px. Titles only, one per screen.
3. **Body** — Inter Tight 400, 12.5–13.5px, line-height 18–20px. Message
   bodies, reasoning, previews.

Letter-spacing is load-bearing in this design. A tracked-caps label at 9.5px
with 2.4px tracking reads completely differently from the same label at 0.

## Screens

### 1. Sign in

Purpose: phone-number entry, the app's front door.

Layout: `padding: 62px 26px 0`, column.
- Logo, centered, `44 × 44`, white (the mark is a dark PNG inverted to white:
  `filter: brightness(0) invert(1)` — in RN, ship a white asset instead).
  Wrapper padding `56px 0 40px`.
- Title: Fraunces italic `34px / 41px`, letter-spacing `-0.4px`, `#FFFFFF`,
  centered. Copy: "Welcome back"
- Subtitle: `13.5px / 20px`, `#FFFFFF`, centered, margin-top `14px`.
  Copy: "We'll text you a 6-digit code to sign in."
- Phone field: margin-top `36px`, `#FFFFFF`, radius `16px`, height `52px`,
  padding `0 18px`, text `16px` `#1C1814`.
- CTA: margin-top `14px`, `#1C1814`, radius `16px`, height `52px`, centered
  label `11.5px`, weight 500, letter-spacing `2.6px`, uppercase, `#FFFFFF`.
  Copy: "Send code". Pressed: `opacity 0.88`.
- Secondary link: margin-top `26px`, centered, `9.5px`, weight 500,
  letter-spacing `2.2px`, uppercase, `#FFFFFF`, with `border-bottom: 1px solid
  rgba(255,255,255,0.6)` and `padding-bottom: 4px`.
  Copy: "Sign in with email instead"
- Footer, pinned to bottom, `padding-bottom: 40px`: `9.5px`, weight 500,
  letter-spacing `1.7px`, uppercase, `rgba(255,255,255,0.85)`, with the name in
  `#FFFFFF`. Copy: "Need help? Chat with Jaipal"

Ground: **clay**.

### 2. Verify

Same frame as sign-in. Differences:
- Title: "Enter the code" · Subtitle: "Sent to +1 555 111 0001"
- Six code cells replace the phone field: row, `gap: 8px`, each `flex: 1`,
  height `56px`, radius `12px`. Filled cell `#FFFFFF`; empty cell
  `rgba(255,255,255,0.22)`. Digit `22px`, weight 500, `#1C1814`.
- CTA label is "Fill the code" until six digits are present, then "Verify".
- Link: "Resend code"

### 3. Top navigation (all signed-in screens)

A single row, no logo, `border-bottom: 1px solid rgba(255,255,255,0.16)`,
padding `20px 26px 0`, `align-items: baseline`.

Three columns, and the column widths matter:
- Left column `flex: 1`, content start-aligned: **Queue** + count.
- Middle column `flex: none`: **Texts**.
- Right column `flex: 1`, content end-aligned: **You**.

This centers "Texts" on the screen (and so on the dynamic island) regardless of
how wide "Queue 3" is. `space-between` does not do this — it centers the middle
item between its neighbors, which drifts right. Do not substitute it.

Each tab: `padding-bottom: 7px`, `margin-bottom: -1px` so its underline sits on
the row's hairline. Label `11px`, weight 500, letter-spacing `2.4px`, uppercase.
Active `#FFFFFF` with `border-bottom: 1px solid #FFFFFF`; inactive
`rgba(255,255,255,0.78)` with a transparent border of the same width.
The queue count sits beside its label at `11px`, weight 500, letter-spacing
`1.2px`, same color as its tab. The Texts tab stays active while a thread is
open.

### 4. Queue — the card

Purpose: the operator's whole job. One flagged guest conversation per card.

Container: `flex: 1`, `align-items: center`, `padding: 0 26px 96px`. The card is
**vertically centered in the space between the nav row and the hint row** — not
pushed down from the top. The 96px bottom padding is what reserves the hint row's
space.

Card: width 100%, **height `560px` fixed**, radius `20px`, `#FFFFFF`,
`box-shadow: 0 26px 64px rgba(20,17,14,0.42)`, `overflow: hidden`, column.
Every card is the same height regardless of how many messages it holds.

Two peek cards sit behind it, absolutely positioned on the same box:
- Near: `rgba(255,255,255,0.55)`, `translateY(15px) scaleX(0.93)`
- Far: `rgba(255,255,255,0.26)`, `translateY(30px) scaleX(0.86)`

Both brighten as the top card is dragged (see Interactions).

The card has four regions, top to bottom:

**a. Flag strip** (`flex: none`), `padding: 11px 20px`, background = the flag
color for this card's tone (`#A85638` clay / `#3A3530` stone / `#1C1814` ink).
- Reason, left: `9.5px`, weight 500, letter-spacing `2.6px`, line-height `14px`,
  uppercase, `#FFFFFF`.
- Counter, right: `9px`, weight 500, letter-spacing `2.2px`,
  `rgba(255,255,255,0.6)`. Format `"01 / 04"`.

**b. Head** (`flex: none`), `padding: 20px 20px 0`.
- Row: name `12.5px`, weight 500, letter-spacing `1.6px`, uppercase, `#1C1814`;
  recognition badge — `border: 1px solid rgba(28,24,20,0.25)`, `padding: 2px 6px`,
  `8px`, weight 500, letter-spacing `1.5px`, uppercase, `#4A4339`, square corners;
  elapsed time pushed right, `9px`, weight 500, letter-spacing `1.9px`,
  uppercase, `#6F6658`.
- Agent reasoning, when present: margin-top `12px`, `12.5px / 19px`, `#6F6658`.
- **No hairline under this block.** An earlier version had one; with a fixed-height
  card and a bottom-anchored thread, a rule there points at empty space.

**c. Conversation** (`flex: 1`, `min-height: 0`, `overflow: hidden`,
`justify-content: flex-end`, `gap: 6px`, `padding: 0 20px 4px`).
Bottom-anchored, so the last message always sits directly above the composer and
slack collects as air under the head.
- Date divider, centered, `padding: 14px 0 10px`: `8.5px`, weight 500,
  letter-spacing `2.2px`, uppercase, `#6F6658`. Copy e.g. "Today · 7:14 PM".
- Incoming bubble: `align-self: flex-start`, `max-width: 78%`, `#E3DCCE`,
  `border-radius: 18px 18px 18px 5px`, `padding: 9px 13px`, text `13.5px / 19px`
  `#1C1814`.
- Outgoing bubble: `align-self: flex-end`, `max-width: 78%`, `#FFFFFF`,
  `border: 1px solid rgba(28,24,20,0.14)`, `border-radius: 18px 18px 5px 18px`,
  `padding: 9px 13px`, text `13.5px / 19px` `#4A4339`.

**d. Composer** (`flex: none`), `padding: 0 20px 20px`. Tapping it opens the edit
takeover.
- `margin-top: 14px`, `padding-top: 14px`, `border-top: 1px solid
  rgba(28,24,20,0.10)`.
- Field: `border: 1px solid rgba(28,24,20,0.18)`, radius `20px`,
  `padding: 11px 48px 11px 15px`, `min-height: 42px`. Draft text `13.5px / 19px`
  `#1C1814`; when no draft exists, the placeholder "Type your answer to send to
  the guest" in `#6F6658`.
- Send glyph: `30 × 30`, radius `15px`, `#A85638`, positioned `right: 6px;
  bottom: 6px`, containing a 14px white paper-plane (Feather `send`, stroke-width
  2, round caps). `opacity: 1` with a draft, `0.3` without.
- Caption, right-aligned, margin-top `9px`: `8.5px`, weight 500, letter-spacing
  `1.9px`, uppercase. With a draft: "Draft — swipe right to send" in `#A85638`.
  Without: "Nothing drafted — swipe left to write" in `#6F6658`.

**e. Hint row** — pinned to the screen, not the card: `position: absolute;
left: 20px; right: 20px; bottom: 46px`, `pointer-events: none`, three columns
like the nav.
- Left: "← Edit" (or "← Write" when there is no draft).
- Center, `flex: none`, `white-space: nowrap`: "Need help? Chat with Jaipal",
  `9.5px`, weight 500, letter-spacing `1.7px`, uppercase,
  `rgba(255,255,255,0.85)` with the name in `#FFFFFF`.
- Right: "Send →".
- Both hints: weight 500, letter-spacing `2.4px`, uppercase. Resting size
  `10px` at `#FFFFFF`. The hint being dragged toward grows to `13px`; the
  opposite hint drops to `rgba(255,255,255,0.45)`. When there is no draft, "Send →"
  is `rgba(255,255,255,0.35)` permanently — swiping right is not available.

### 5. Queue — the four flag states

Content comes from `lib/fixtures/queue.ts`. Each card carries a `tone` that
selects both the strip color and the screen's ground:

| Reason | Tone | Strip | Has draft |
| --- | --- | --- | --- |
| "Reservation" | clay | `#A85638` | yes |
| "Flagged — first message from new guest" | stone | `#3A3530` | yes |
| "Flagged — low fidelity score" | clay | `#A85638` | yes |
| "Flagged — no draft generated" | ink | `#1C1814` | **no** |

The no-draft card is the important variant: the send glyph drops to 30% opacity,
the caption changes, the left hint reads "← Write", and swipe-right is disabled.

### 6. Swipe mechanics

Commit threshold: **80px**. Drag distance normalizes to an intensity of
`min(1, |dx| / 140)`.

- The card follows the finger on x and rotates `dx * 0.04` degrees.
- Release under threshold: spring back, `transform 220ms cubic-bezier(.2,.8,.2,1)`.
  While dragging, no transition.
- Release past threshold: the card flies to `dx = ±440px` and the action fires
  **250ms** later.
- Right (send) wash: overlay on the card's right `64%`, z-above content,
  `linear-gradient(to left, rgba(168,86,56,0.94), rgba(168,86,56,0.52) 44%,
  rgba(168,86,56,0.18) 74%, rgba(168,86,56,0))`, opacity = intensity.
- Left (edit) wash: mirror on the left `64%`,
  `linear-gradient(to right, rgba(58,53,48,0.92), rgba(58,53,48,0.5) 44%,
  rgba(58,53,48,0.16) 74%, rgba(58,53,48,0))`, opacity = intensity.
- Peek cards brighten with intensity: near `0.55 + intensity * 0.35`,
  far `0.26 + intensity * 0.16`.
- The screen's ground crossfades to the next card's ground as the deck advances.

### 7. Sent — undo toast

`position: absolute; left: 20px; right: 20px; bottom: 40px`, `#FBF8F2`, radius
`18px`, `overflow: hidden`, `box-shadow: 0 16px 38px rgba(20,17,14,0.34)`.
- Row `padding: 15px 18px`: message `13px` `#1C1814` with the guest name in
  `#6F6658` ("Sent" / "Sent your version" / "Dismissed", then "to Maya R.");
  "Undo" right-aligned, `9.5px`, weight 500, letter-spacing `2.2px`, uppercase,
  `#A85638`.
- A `2px` drain bar under the row: track `rgba(28,24,20,0.10)`, fill `#A85638`
  animating `scaleX(1) → scaleX(0)`, `transform-origin: left`, **3s linear**,
  matching the auto-dismiss timeout exactly.

### 8. Queue — empty

Centered column, `gap: 16px`, `padding: 0 40px 70px`.
- An `8 × 8` dot, radius `4px`, `#E5B19C`, `margin-bottom: 6px`.
- Fraunces italic `32px / 38px`, `#FFFFFF`, centered: "You're all caught up."
- Body `13px / 20px`, `rgba(255,255,255,0.92)`, centered, `max-width: 250px`:
  "Nothing pending review. Guests are being handled. Take a breath."
- The "Need help?" footer, `padding-bottom: 46px`.

Ground: **stone**.

### 9. Texts (currently "Conversations")

**Rename**: the tab and screen are called **Texts**, not Conversations. Route
and component names can stay `conversations` if that churn isn't worth it; the
user-facing string changes.

Header, `padding: 22px 22px 14px`:
- Fraunces italic `30px / 35px`, letter-spacing `-0.4px`, `#FFFFFF`:
  "Everything happening."
- Meta, margin-top `12px`: `9.5px`, weight 500, letter-spacing `2.4px`,
  uppercase, `rgba(255,255,255,0.92)`. Format: "3 active now · 9 open".

Filters — a row, `gap: 8px`, `padding: 0 22px 16px`. Both pills: radius `999px`,
`padding: 7px 13px`, label `9.5px`, weight 500, letter-spacing `1.8px`,
uppercase.
- **Active** toggle: off — `rgba(255,255,255,0.14)` fill,
  `1px solid rgba(255,255,255,0.4)`, `#FFFFFF` text, `#E5B19C` dot. On —
  `#FFFFFF` fill and border, `#1C1814` text, `#A85638` dot. Dot is `5 × 5`,
  radius `5px`, `gap: 7px`.
- **Type** menu trigger: `rgba(255,255,255,0.14)` fill,
  `1px solid rgba(255,255,255,0.4)`, `#FFFFFF` label showing the current filter,
  and an `8px` `▼` in `rgba(255,255,255,0.75)`, `gap: 8px`.

List — `padding: 0 14px 58px`, scrollable. **No grouping and no section
headers**; the filters do that job. Rows alternate a translucent band:
- Row: radius `12px`, `padding: 13px 16px`, background
  `rgba(255,255,255,0.12)` on even rows, `transparent` on odd. Pressed:
  `rgba(255,255,255,0.2)`.
- Top line, `gap: 9px`: activity dot `5 × 5` — `#E5B19C` if active (last
  message ≤ 60 min), else `rgba(255,255,255,0.32)`; name `12.5px`, weight 500,
  letter-spacing `1.4px`, uppercase, `#FFFFFF`; badge with
  `1px solid rgba(255,255,255,0.4)`, `padding: 2px 6px`, `8px`, letter-spacing
  `1.5px`, uppercase, `#FFFFFF`; relative time pushed right, `9px`,
  letter-spacing `1.8px`, uppercase, `rgba(255,255,255,0.78)`.
- Preview line: margin-top `6px`, `padding-left: 14px` (aligns under the name),
  `12.5px / 18px`, `rgba(255,255,255,0.8)`, single line, ellipsized. Format:
  "Sana — Done — got you down for two at 7:30…"
- Relative time format: `<1m` → "now", `<60` → "42m", `<1440` → "3h",
  else "2d".

Ground: **stone**.

### 10. Type filter menu

Scrim: `position: absolute; inset: 0`, `rgba(20,17,14,0.28)`, tap to dismiss.
Panel, anchored under its trigger — `top: 242px; left: 96px`, `min-width: 196px`,
`#FFFFFF`, radius `16px`, `padding: 6px`,
`box-shadow: 0 18px 44px rgba(20,17,14,0.34)`.
Options: `padding: 11px 14px`, radius `12px`, label `12px`, letter-spacing
`0.2px`, `#1C1814` — weight 500 and background `rgba(28,24,20,0.06)` when
selected, weight 400 and transparent otherwise. Count right-aligned, `10px`,
weight 500, letter-spacing `1.4px`, `#6F6658`.
Options: All guests, New, Returning, Regular, Raving Fan — each with its live
count.

### 11. Text thread (read-only)

Header, `padding: 16px 22px`, `gap: 14px`:
- Back chevron `‹`, `20px`, `#FFFFFF`.
- Name `12.5px`, weight 500, letter-spacing `1.6px`, uppercase, `#FFFFFF`;
  badge with `1px solid rgba(255,255,255,0.45)`, `8px`, letter-spacing `1.5px`.
- Meta below, `10.5px`, letter-spacing `0.3px`, `rgba(255,255,255,0.92)`.
  Format: "+1 555 111 0001 · 4 conversations since June".
- State pill, right: radius `999px`, `1px solid rgba(255,255,255,0.4)`,
  `padding: 5px 10px`, dot `5 × 5` `#E5B19C` when live else
  `rgba(255,255,255,0.6)`, label `8.5px`, letter-spacing `1.8px`, uppercase,
  `#FFFFFF`. Copy "Live" / "Quiet".

Messages: `flex: 1`, `justify-content: flex-end`, `gap: 6px`,
`padding: 14px 22px 10px`. Same bubbles as the card, except the outgoing bubble
has **no border** here. Date divider `8.5px`, letter-spacing `2.2px`, uppercase,
`rgba(255,255,255,0.92)`.

Footer note, `padding: 14px 22px 46px`, `gap: 10px`: a `5 × 5` `#E5B19C` dot
(margin-top `7px`) and `12.5px / 19px` `rgba(255,255,255,0.94)` text: "Sana is
handling this one. You'll see it in the queue if it needs your input." There is
no composer — this screen is read-only by design; replying happens in the queue.

Ground: **stone**.

### 12. Edit takeover

A full-screen overlay, `z-index: 8`, `padding-top: 62px`, whose ground is **the
current card's ground** — so the color carries through from the card you swiped.

- Header, `padding: 14px 20px 0`: "‹ Back" left, `10px`, weight 500,
  letter-spacing `2.2px`, uppercase, `#FFFFFF`; name + badge centered (badge
  border `rgba(255,255,255,0.5)`); an empty `flex: 1` right to keep the center
  centered.
- Reason block, `padding: 18px 22px`: reason `9.5px`, weight 500,
  letter-spacing `2.6px`, uppercase, `#FFFFFF`; reasoning below at
  `12.5px / 19px`, `#FFFFFF`, margin-top `10px`.
- Conversation: `flex: 1`, bottom-anchored, `gap: 6px`, `padding: 8px 22px`.
  Same bubbles.
- Composer, `padding: 14px 20px 0`: textarea `#FFFFFF`, no border, radius
  `20px`, `padding: 14px 54px 14px 16px`, `min-height: 78px`, `13.5px / 20px`,
  `#1C1814`, no outline. Placeholder "Edit the message…" (or "Type your answer
  to send to the guest" when there was no draft).
- Send: `32 × 32`, radius `16px`, `#A85638`, `right: 9px; bottom: 13px`, 15px
  white paper-plane. `opacity: 0.4` and inert while the field is empty.
- Escape hatch, centered, margin-top `16px`, `padding-bottom: 28px`: "Don't send
  anything", `9.5px`, weight 500, letter-spacing `2.2px`, uppercase,
  `rgba(255,255,255,0.85)`. Dismisses the card and fires the "Dismissed" toast.

### 13. You

Header, `padding: 22px 22px 18px`:
- Logo `34 × 34`, white, margin-bottom `16px`.
- Fraunces italic `30px / 35px`, letter-spacing `-0.4px`, `#FFFFFF` — the
  venue name, e.g. "Sextant Coffee Roasters".
- Meta `9.5px`, weight 500, letter-spacing `2.4px`, uppercase,
  `rgba(255,255,255,0.92)`: "Signed in as jaipal@theanalog.company".

Cards, `padding: 0 18px`, `gap: 9px`. Each `#FFFFFF`, radius `16px`,
`box-shadow: 0 8px 22px rgba(20,17,14,0.14)`. Rows `padding: 16px 18px`, divided
by `1px solid rgba(28,24,20,0.10)`. Row label `11px`, weight 500,
letter-spacing `2.2px`, uppercase, `#1C1814`; value `10px`, weight 500,
letter-spacing `1.8px`, uppercase, `#6F6658`; chevron `›` `12px` `#6F6658`.

- Card one: "Push notifications" → "On"; "Chat with Jaipal" → chevron.
- Card two, its own card: "Sign out", label in `#A85638`. Pressed
  `opacity: 0.88`.

**Sign out lives here**, as a discrete destructive row — not behind a logo tap
and not in a hamburger. The current app's hamburger menu is retired; the three
tabs replace it.

Ground: **stone**.

## Interactions & behavior

| Trigger | Result |
| --- | --- |
| Drag card right past 80px, draft present | Card flies right; after 250ms it leaves the deck and the "Sent" toast appears |
| Drag card right, no draft | Nothing commits; the card springs back. Right hint stays dimmed |
| Drag card left past 80px | Card flies left; after 250ms the edit takeover opens, prefilled with the draft |
| Release under 80px | Spring back, 220ms `cubic-bezier(.2,.8,.2,1)` |
| Tap the card's composer | Opens the edit takeover without a swipe |
| Send in the takeover | Closes, fires "Sent your version" toast |
| "Don't send anything" | Closes, fires "Dismissed" toast |
| Tap Undo in a toast | Restores the card to the front of the deck, cancels the timer |
| Toast timeout | 3000ms, matching the drain bar |
| Deck empties | Empty state, ground crossfades to stone |
| Tap Active pill | Filters to conversations with activity in the last 60 min |
| Tap type pill | Opens the anchored menu; picking an option filters and closes |
| Tap a list row | Opens the read-only thread; the Texts tab stays active |
| Tap Sign out | Returns to sign-in |

## State

```
mode: 'queue' | 'convos' | 'thread' | 'you'
auth: null | 'signin' | 'verify'
drafts: QueueDraft[]        // deck; index 0 is the top card
dragX: number               // live drag offset
dragging: boolean
editing: boolean            // edit takeover open
editText: string
toast: string | null        // verb shown in the toast
lastRemoved: QueueDraft     // undo target
activeOnly: boolean
typeFilter: 'All guests' | 'New' | 'Returning' | 'Regular' | 'Raving Fan'
menuOpen: boolean
thread: string | null       // guest name
code: string                // verify screen
```

Two timers, both cleared on unmount and on undo: the 250ms fly-out and the
3000ms toast dismiss.

Data comes from the existing fixtures — `lib/fixtures/queue.ts` for the deck and
`lib/fixtures/conversations.ts` for the list. The prototype's copy was taken from
them; keep them as the source of truth.

## Design tokens

Palette (all already in `tailwind.config.js`):

```
clay        #C66A4A     ink         #1C1814
clay-deep   #A85638     ink-soft    #4A4339
clay-soft   #E5B19C     ink-faint   #857A6A
sand        #F2EBDC     stone       #D8CFC0
paper       #F7F1E3     stone-light #E8E2D6
parchment   #EDE4D2     inbound     #3A3530
```

Values used in the design that are not yet tokens:

```
bubble-in     #E3DCCE     meta text     #6F6658
toast surface #FBF8F2     preview text  #5C5447
```

**Grounds — placeholders, to be replaced.** Each is three stacked layers: a top
scrim for chrome contrast, a radial highlight behind the card, and a base ramp.

```css
/* clay — reservation, low-fidelity flags, sign-in */
linear-gradient(to bottom, rgba(26,16,10,0.58), rgba(26,16,10,0.42) 26%, rgba(26,16,10,0) 54%),
radial-gradient(120% 70% at 50% 48%, rgba(229,177,156,0.3), rgba(229,177,156,0) 62%),
linear-gradient(168deg, #9E4E30 0%, #8A3E24 46%, #48210F 100%)

/* stone — new-guest flag, and every non-queue screen */
linear-gradient(to bottom, rgba(22,17,12,0.64), rgba(22,17,12,0.46) 26%, rgba(22,17,12,0) 54%),
radial-gradient(120% 70% at 50% 48%, rgba(247,241,227,0.26), rgba(247,241,227,0) 62%),
linear-gradient(168deg, #8A8072 0%, #5F5749 46%, #24211C 100%)

/* ink — no draft generated */
radial-gradient(120% 76% at 50% 10%, rgba(133,122,106,0.42), rgba(133,122,106,0) 62%),
linear-gradient(168deg, #4A4339 0%, #2A251F 50%, #131110 100%)
```

Whatever replaces them must keep white `11px` chrome at 4.5:1 against the
composited ground at the nav row, and `rgba(255,255,255,0.8)` body text at 4.5:1
wherever it appears.

Scales actually used:

```
radius     5 (bubble tail) · 12 · 15/16 · 18 · 20 · 999 (pill)
spacing    4 6 7 9 10 12 14 16 18 20 22 26 (4px-ish, not rigid)
shadows    card   0 26px 64px rgba(20,17,14,0.42)
           panel  0 8px 22px rgba(20,17,14,0.14)
           menu   0 18px 44px rgba(20,17,14,0.34)
           toast  0 16px 38px rgba(20,17,14,0.34)
```

## Translating to React Native

The HTML uses web primitives that need real equivalents. Do not reach for a
WebView.

1. **Grounds** — three stacked `expo-linear-gradient` layers, or one
   `<Canvas>` from `@shopify/react-native-skia` if you want the radial
   highlight exactly. RN has no `radial-gradient`; Skia's `RadialGradient` or a
   pre-rendered PNG are the two honest options. The crossfade between grounds is
   two absolutely-positioned grounds with an animated opacity.
2. **Swipe** — `react-native-gesture-handler` `Pan` + `react-native-reanimated`.
   `translateX` follows the gesture, `rotate` derives as `dx * 0.04deg`, the two
   wash overlays derive their opacity from `interpolate(|dx|, [0, 140], [0, 1])`,
   and the peek cards' opacity interpolates from the same value. Commit on
   `onEnd` past 80px with `withTiming(±440, { duration: 250 })` and a callback.
3. **Text tracking** — RN honors `letterSpacing` but does not have
   `text-transform` on Android reliably. Uppercase the strings, don't style them.
4. **Shadows** — `boxShadow` is supported on RN 0.76+; below that, use
   `shadowColor/Offset/Opacity/Radius` on iOS and accept `elevation` on Android.
   The card's shadow is large and soft; don't let Android's elevation flatten it.
5. **The white logo** — ship a white PNG rather than emulating the CSS
   `brightness(0) invert(1)` filter.
6. **Bottom-anchored message lists** — `justifyContent: 'flex-end'` on a
   `ScrollView`'s `contentContainerStyle` with `flexGrow: 1`, or an inverted
   `FlatList`.
7. **The three-column nav** — `flex: 1` / `flex: 0` / `flex: 1` as described.
   This is the one layout detail most likely to be "simplified" into
   `space-between` and quietly break.
8. **Textarea** — `TextInput` with `multiline`, and account for the keyboard
   (`KeyboardAvoidingView`) in the edit takeover, which the mock does not show.

## Assets

- `assets/images/logo.png` — the Analog mark, from the repo. Rendered white
  throughout; ship a white variant.
- Paper-plane glyph — Feather `send`, inline SVG in the mock. Use whatever icon
  library the app already has.
- Fonts — Fraunces (italic 400) and Inter Tight (400/500/600), Google Fonts.
- No photography or illustration anywhere in the design.

## Files in this bundle

- `Operator App - Screens.dc.html` — **the reference.** Every screen, left to
  right in flow order, each labeled, each in an iPhone frame. Open this first.
- `Operator App - Prototype.dc.html` — the working prototype behind those
  frames. Drag the cards, tap the tabs, type in the composer. The exact source
  of every value in this document; its `GROUNDS`, `STRIP`, `seedDrafts()` and
  `CONVOS` constants are the data model in miniature.
- `Operator App - Current State.dc.html` — the app **as it is today**, for
  before/after comparison.
- `support.js`, `ios-frame.jsx`, `assets/` — runtime for the above. Open the
  HTML files from this folder with a static server (`npx serve .`), not
  `file://`.
