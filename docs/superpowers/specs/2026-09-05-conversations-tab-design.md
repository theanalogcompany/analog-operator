# Conversations Tab — Design

Date: 2026-09-05
Status: Approved for planning
Scope: **Cross-repo.** Touches both `analog-operator` (this repo) and the sibling `analog-guest` repo.

## Background

`Conversations Tab.dc.html` (Claude Design project "Operator conversations view
feature", imported via the `claude_design` MCP) specifies a new operator-facing
view: a scrollable list of every guest conversation at the operator's venues —
not just the ones with a pending draft — with filtering, a live-updating feed,
and a read-only thread viewer. Today the app has no tab navigation at all; the
only screens are the Queue stack (`app/queue/index.tsx` + `edit.tsx`), sign-in,
and the auth callback.

Two things established during design review that don't exist anywhere in
either codebase today:

- No `analog-guest` endpoint lists all open conversations. The only related
  server code is the per-draft queue (`GET /api/operator/queue`), the
  per-message thread (`GET /api/operator/messages/:id/thread`), and an
  internal, admin-only single-guest conversation viewer (TAC-306/TAC-316) that
  requires picking one venue and one guest from a dropdown — it doesn't list
  guests by recent activity.
- No per-venue "agent persona name" concept is wired to anything operator- or
  guest-facing yet, but `BrandPersonaSchema.voiceName`
  (`lib/schemas/brand-persona.ts` in `analog-guest`) already exists for
  exactly this purpose ("Human-readable label for the voice... rendered in the
  topbar + sidebar voice list. Optional — venues onboarded before this field
  landed fall back to the venue display name"). We reuse it rather than invent
  a parallel concept.

## Decisions locked during brainstorming

1. **Build both sides now**, not fixture-only. The `analog-guest` endpoints
   get built, tested, and locally curl-verified as part of this work — not
   deferred to an unblocked sibling ticket. Actual production deploy is the
   user's call, not something this build does automatically.
2. **Real agent name in copy.** Footer/thread copy ("Sana is handling this
   one...", "Sent by Sana ·") uses the venue's real configured voice name
   (`agentName`, sourced from `BrandPersonaSchema.voiceName`, falling back to
   the venue's display name when unset) — not a hardcoded placeholder.
3. **Queue count lifts to the root layout.** `useQueue()` moves from
   `app/queue/_layout.tsx` up into `app/_layout.tsx` so both `/queue` and
   `/conversations` share one live count and one realtime subscription. This
   touches app-root wiring, which per CLAUDE.md requires an on-device smoke
   test (cold launch + queue swipe) before merge.
4. **Live realtime for the conversations list**, mirroring the existing
   queue-channel/thread-channel pattern (fixture-backed now, Supabase
   Realtime once the endpoint is live) — not a fetch-on-focus-only v1.

## Cross-repo Contract

This is the source of truth for both sides. Code matches this section, not
the other way around (per CLAUDE.md's cross-repo contract rules) — if either
side needs to diverge from what's written here, this section gets updated
first, in the same change.

### `GET /api/operator/conversations`

Auth: bearer operator JWT, same inline `verifyOperatorRequest` pattern as
`/api/operator/messages/[id]/thread` (Contract-shaped error bodies, not the
legacy `withOperatorAuth` HOF body shape).

Response `200`:

```json
{
  "conversations": [
    {
      "guestId": "bb22e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e",
      "venueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "venueSlug": "mock-sextant-coffee-roasters",
      "venueTimezone": "America/Los_Angeles",
      "name": "Maya R.",
      "phoneFallback": "+15551110001",
      "recognitionState": "returning",
      "lastMessageAt": "2026-09-05T21:39:00.000Z",
      "lastMessageDirection": "outbound",
      "lastMessagePreview": "Done — got you down for two at 7:30...",
      "conversationCount": 2,
      "firstConversationAt": "2026-08-31T18:00:00.000Z",
      "agentName": "Sana"
    }
  ]
}
```

Field notes:

- `name`: `guests.first_name` + `guests.last_name` composed, or `null` if both
  are absent (client falls back to `phoneFallback`, matching the existing
  `PendingDraft.guestDisplayName` convention).
- `recognitionState`: current `guest_states` row where `exited_at IS NULL`,
  same enum as `GuestRecognitionState` (`new | returning | regular |
  raving_fan`); `null` if no row exists.
- `conversationCount` / `firstConversationAt`: **modeling call, not an
  existing field.** Defined as the count of distinct venue-local calendar
  days with at least one message (either direction) from that guest, and the
  earliest such day. Cheap SQL aggregate (`count(distinct
  date_trunc('day', created_at at time zone venue.timezone))`), matches the
  intuitive "how many times have they reached out" meaning. Flagged for
  override if a different definition is wanted later — this is presentation
  copy, not a stored fact, so changing it later is a query change, not a
  migration.
- `lastMessageAt` / `lastMessageDirection` / `lastMessagePreview` and the
  `conversationCount` / `firstConversationAt` aggregate all exclude
  empty-body messages, matching `loadGuestThread`'s existing `.neq('body',
  '')` filter — empty-body rows are reactions/status pings, not
  conversation turns, and showing one as a "last message" preview would
  render a blank row.
- `agentName`: `venue_configs` persona's `voiceName` if set, else the venue's
  display name. Same fallback rule as documented on `BrandPersonaSchema`.
- Ordered by `lastMessageAt` descending. Capped at 200 rows (soft cap,
  matches the existing queue convention — "if a single operator has more than
  200 active conversations, there are bigger problems than pagination").
- Empty `allowedVenueIds` → `200 { "conversations": [] }` (not an error),
  matching `/api/operator/queue`'s convention.

Errors: `401 { "error": "unauthorized" }`, `500 { "error": "internal_error" }`.

### `GET /api/operator/guests/:guestId/thread`

Identical response contract to the existing
`GET /api/operator/messages/:id/thread`:

```json
{ "messages": [{ "id": "...", "direction": "inbound", "body": "...", "createdAt": "..." }] }
```

Same 200-most-recent, oldest→newest windowing (`THREAD_MESSAGE_LIMIT`), same
404 collapsing for "guest doesn't exist" and "guest exists outside the
operator's allowlist" (`{"error":"not_found"}`), same invalid-UUID → 404
handling. The only difference from the existing endpoint is the lookup key:
`guestId` directly instead of resolving `(venue_id, guest_id)` from a
`messageId` first.

### Env vars

None new. Both endpoints use the existing operator-auth and admin-client
wiring already present in `analog-guest`.

## `analog-guest` implementation

- `lib/operator/conversations.ts`: new module, modeled directly on
  `lib/operator/queue.ts` / `lib/operator/thread.ts`'s conventions
  (`createAdminClient()`, ok/error result types, camelCase projection).
  Likely needs a small SQL function (new migration) analogous to
  `list_operator_queue` (migration 018) to do the guest+last-message+state
  join in one round trip rather than N+1 — exact shape decided at
  implementation time, but the Contract above is the fixed output regardless
  of how the query gets there.
- `lib/operator/guest-thread.ts` (or extend `lib/operator/thread.ts`): thin
  wrapper reusing the same query body as `loadGuestThread`, skipping the
  messageId→guestId resolution step.
- New routes: `app/api/operator/conversations/route.ts`,
  `app/api/operator/guests/[guestId]/thread/route.ts`, following the inline
  `verifyOperatorRequest` auth pattern (not `withOperatorAuth`) so error
  bodies match the Contract exactly.
- Tests: `route.test.ts` for both routes, mirroring
  `app/api/operator/messages/[id]/thread/route.test.ts`'s structure (mocked
  admin client, auth failure cases, allowlist boundary, empty-allowlist
  200-empty case).
- **Rollout order**: build + unit-test both endpoints, run the Next dev
  server locally, curl-verify each against the literal request/response
  shapes in the Contract section above. Only after that passes does any
  `analog-operator` live-mode code get written, per the repo's server-first
  cross-repo rule. No production deploy as part of this build.

## `analog-operator` implementation

### Navigation

- `app/conversations/_layout.tsx` (bare `Stack`, `headerShown: false`) +
  `app/conversations/index.tsx` (list) +
  `app/conversations/[guestId].tsx` (thread, `presentation: 'card'`,
  `animation: 'slide_from_right'` — same as `/queue/edit`).
- Root `app/_layout.tsx`: add `<Stack.Screen name="conversations" />` next to
  `<Stack.Screen name="queue" />` inside the existing `Stack.Protected
  guard={isSignedIn}` block.
- `useQueue()` moves out of `app/queue/_layout.tsx` into `app/_layout.tsx`.
  The context itself relocates to `lib/queue-context.tsx` (new file) so
  neither `app/queue/_layout.tsx` nor a future `app/conversations/_layout.tsx`
  needs to know where the provider lives — both just import
  `useQueueContext()`. `app/queue/_layout.tsx` shrinks to a bare `Stack`
  (identical shape to the new `app/conversations/_layout.tsx`).
- New `components/shell/queue-tabs-header.tsx`: hamburger + logo (unchanged
  from `QueueHeader`) plus the "Queue N / Conversations" segmented row below
  it. Reads the queue count from `useQueueContext()`. Tab switch calls
  `router.replace('/queue')` / `router.replace('/conversations')` — replace,
  not push, so switching tabs doesn't grow the back stack. Replaces the bare
  `QueueHeader` usage in `app/queue/index.tsx`; used the same way in the new
  `app/conversations/index.tsx`.

### Data layer

- `lib/api/conversations.ts` (new), mirroring `lib/api/queue.ts`:
  - `ConversationSummarySchema` / `ConversationSummary` — matches the
    Contract field-for-field, `.nullable()` where the Contract says nullable,
    non-strict (forward-compat, same reasoning as `ThreadMessageSchema`).
  - `listConversations(): Promise<Result<ConversationSummary[]>>` — fixture
    branch to `lib/fixtures/conversations.ts`; live branch calls
    `GET /api/operator/conversations`, unwraps `{ conversations }`.
  - `getGuestThread(guestId): Promise<Result<ThreadMessage[]>>` — fixture
    branch reuses/extends the existing thread fixture data; live branch calls
    `GET /api/operator/guests/:guestId/thread`, unwraps `{ messages }`
    (reuses the existing `ThreadMessage` / `ThreadMessageSchema` from
    `lib/api/queue.ts` — identical shape, no duplicate type).
- `lib/fixtures/conversations.ts` (new): the design's 12-guest seed data
  ported directly (names, types, message histories, `lastAt` times) so
  fixture mode visually matches the mockup. Exposes
  `listConversationsFixture()`, `getGuestThreadFixture(guestId)`, and a
  `subscribeConversationsFixture` emitter + `triggerConversationActivityFixture`
  dev hook mirroring `triggerQueueAddedFixture` / the design's simulated
  8.5s "live" delivery — used for manual QA of the live-flash behavior
  without a backend.
- `lib/realtime/conversations-channel.ts` (new) +
  `hooks/use-conversations-realtime.ts` (new): structurally identical to
  `queue-channel.ts` / `use-queue-realtime.ts` — fixture-mode delegates to
  the fixture emitter; live-mode opens a venue-allowlist-scoped
  `postgres_changes` subscription on `messages` (any direction, any
  review_state) and triggers a reload on any event, same reasoning as the
  queue channel (the raw row doesn't carry the joined summary fields needed
  to patch state locally).
- `hooks/use-conversations.ts` (new): mirrors `hooks/use-queue.ts` — holds
  the fetched list, status, reload, wires the realtime hook. Sorting: by
  `lastMessageAt` ascending "minutes ago" (soonest-active first), matching
  the mockup.
- `lib/theme.ts`: add a `conversations` namespace constant,
  `activeWindowMins: 60` (the mockup's default), used to compute the
  "active" pulsing-dot state and the "Active" filter pill.

### Components

- Reuse `RecognitionBadge` unchanged for type badges in both the list rows
  and the thread header — its palette (`lib/theme.ts` + inline hex map) is
  byte-identical to the mockup's `PALETTES`.
- Reuse `lib/thread-cluster.ts::computeItems` unchanged for message
  clustering in the thread view.
- Extract the thread-bubble JSX currently inlined in `app/queue/edit.tsx`
  (the `.map((item) => ...)` block rendering timestamp rows and bubbles) into
  `components/thread/thread-bubble-list.tsx`, taking `items: ThreadItem[]` as
  a prop. `app/queue/edit.tsx` and the new
  `app/conversations/[guestId].tsx` both consume it — avoids duplicating that
  styling logic across two screens now that there are two.
- `components/conversations/conversation-row.tsx` (new): one list row — dot
  (pulsing clay if active, hollow hairline outline if not), name, recognition
  badge, relative time, "{Guest|agentName} · {preview}" line. New relative-time
  formatter distinct from `queueCardMinutesPending` (compact "2m/1h/3d" per
  the mockup, vs. the queue card's verbose "2 min/1 hr" — different surface,
  different existing convention already establishes the queue card's format
  as fixed, so this is a new small helper, not a shared one).
- `components/conversations/type-filter-menu.tsx` (new): the anchored
  dropdown (All guests / New / Returning / Regular / Raving fan, each with a
  count). Plain absolutely-positioned `View` + full-screen invisible
  `Pressable` backdrop for outside-tap dismiss (RN `Modal` doesn't support
  anchored positioning well enough for this).
- `components/queue/empty-state.tsx`: add a `variant: 'queue' | 'conversations'`
  prop (default `'queue'`) rather than a new component — same visual
  structure (dot + Fraunces headline + faint body), different copy.

### Screens

- `app/conversations/index.tsx`: `queue-tabs-header` + "Everything
  happening." + "{activeCount} active now · {totalCount} open" + Active pill
  + type filter dropdown + list of `ConversationRow`s (via
  `useConversations()`) + empty state (`variant="conversations"`).
- `app/conversations/[guestId].tsx`: back chevron, name + `RecognitionBadge`,
  meta line (`phoneFallback` + "{conversationCount} conversations since
  {Month}" / "first conversation" when count is 1), Live/Quiet pill (pulsing
  if within `activeWindowMins`), `thread-bubble-list`, last-line footer
  ("From the guest · {time}" / "Sent by {agentName} · {time}"), footer note
  ("{agentName} is handling this one. You'll see it in the queue if it needs
  your input."). **Read-only — no compose box, no send/edit/skip actions.**
  Uses `useThreadRealtime` unchanged (already keyed by venueId+guestId, not
  messageId) for live updates while open.

## Error handling

- `listConversations()` / `getGuestThread()` follow the exact
  errors-as-values shape already established in `lib/api/queue.ts` — `{ ok:
  true, data }` / `{ ok: false, error: ApiError }`, same `NO_SESSION | HTTP |
  NETWORK | PARSE` taxonomy, no new error kinds.
- List load failure: same pattern as the Queue screen today — a retry
  affordance, not a silent empty state.
- Guest-thread fetch failure on the thread screen: falls back to whatever the
  list already had cached for that guest's last message (there's no
  `recentContext` equivalent here since conversations aren't drafts, so the
  fallback is just "last message preview" rendered as a single bubble,
  distinctly simpler than the edit screen's `recentContext` fallback) —
  exact fallback UI decided at implementation time, but must not show a blank
  screen on fetch failure.

## Testing

- `analog-guest`: `route.test.ts` for both new endpoints, mirroring the
  existing thread-route test's structure — auth failure, allowlist
  boundary/404-collapsing, empty-allowlist 200-empty, and the
  `conversationCount` day-bucketing aggregate specifically (a fixture with
  messages spanning known days, asserting the exact count).
- `analog-operator`: unit tests for `lib/api/conversations.ts` following the
  existing `__tests__/lib/api-queue.test.ts` pattern — HTTP-shape assertions
  transcribed from the Contract section above, in a live-mode block with
  `fetch` mocked (never from the fixture-mode block, per the repo's
  contract-boundary testing rule). Unit tests for the new relative-time
  formatter and the day-bucketing-adjacent client logic (sorting, active-window
  filtering) as pure functions.
- **Manual end-to-end UAT is a Done gate for this ticket pair** (per CLAUDE.md
  cross-repo rule #4) — unit tests passing on both sides doesn't close this;
  the operator runs the live cross-repo flow on device and confirms behavior
  before either side is marked Done.
- Root-layout change (queue count lift): on-device smoke test — cold launch,
  confirm the queue swipe gesture still works, confirm the tab header shows
  the correct count on both tabs.

## Out of scope (this build)

- Pagination beyond the 200-row soft cap.
- Any compose/send/edit affordance on the Conversations thread view — it is
  intentionally read-only.
- Production deploy of the `analog-guest` endpoints (local build + test +
  curl-verify only; deploy is a separate, explicit user decision).
- Changing how `recognitionState` itself is computed (out of scope — this
  only reads the existing `guest_states` current row).
- Linear ticket creation — the `linear-bot` MCP connection is currently
  broken (auth rejected) in this session; this spec's Contract section is
  written to be pasted directly into whatever ticket(s) get opened.
