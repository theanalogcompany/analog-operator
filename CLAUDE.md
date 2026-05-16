# analog-operator

The operator-facing native mobile app for Analog — a guest recognition platform for independent cafes, bakeries, and restaurants. The operator uses this app to review and approve AI-drafted iMessage/SMS replies before they ship to guests. The actual messaging engine lives in the sibling `analog-guest` repo; this app consumes operator-facing API endpoints from there.

## Stack

- Expo SDK (latest stable) + React Native + TypeScript
- expo-router (file-based routing)
- NativeWind (Tailwind-for-RN) for styling
- react-native-reanimated + react-native-gesture-handler for animation/gesture primitives
- expo-font for custom font loading
- Supabase JS client (for auth session management; the database itself lives behind `analog-guest`'s API)

## Folder layout

- `app/` — expo-router file-based routes (screens live here, indexed by file name)
- `components/` — reusable UI components
- `lib/` — shared utilities, API clients, hooks, Zod schemas
  - `lib/api/` — typed clients for `analog-guest` endpoints (Result-shaped, Bearer-attached)
  - `lib/fixtures/` — in-memory data + simulated emitters for parallel-build scaffolds
  - `lib/realtime/` — channel adapters (fixture today, Supabase Realtime later)
  - `lib/theme.ts` — non-color design tokens (motion thresholds, durations, easings). Colors stay in `tailwind.config.js`.
- `hooks/` — custom React hooks
- `assets/` — fonts, images, icons
- `docs/prototypes/` — design HTML prototypes used as visual source of truth
- `.claude/` — workflow infrastructure (slash commands and sub-agents)

This repo has no database, no migrations, no API routes, no AI/runtime code. All of that lives in `analog-guest`.

## Code conventions

- PascalCase for components and types
- camelCase for functions and variables
- kebab-case for filenames
- SCREAMING_SNAKE for env vars (prefix with `EXPO_PUBLIC_` for anything accessed in app code)
- Prefer functions over classes
- Async/await over `.then()`
- Zod for runtime validation at all API boundaries
- No `any` types — use `unknown` and narrow
- Errors as values for internal functions: return `{ ok: true, data }` or `{ ok: false, error }`. Throw only at outer boundaries (top-level effects, event handlers).

## Brand tokens

- `--clay: #C66A4A` — terracotta, primary accent, send/approve actions
- `--sand: #F2EBDC` — warm background, default screen background
- `--inbound: #3A3530` — dark warm-gray, body text and inbound message bubbles
- Typography: Fraunces (italic, display — wordmark, greetings), Inter Tight (regular + medium — UI body, buttons, labels)

NativeWind config exposes these as Tailwind tokens (`bg-sand`, `text-inbound`, `bg-clay`, etc.).

## API consumption

- This app calls operator-facing endpoints in `analog-guest`. Spec lives in Linear ticket TAC-258.
- Base URL via env var: `EXPO_PUBLIC_API_BASE_URL` (e.g. `https://analog-guest.vercel.app`)
- **Fixture mode: when `EXPO_PUBLIC_USE_FIXTURES === 'true'`, `lib/api/queue.ts` and `lib/realtime/queue-channel.ts` route to in-memory fixtures (`lib/fixtures/queue.ts`).** Strict-true gating — `false`, `0`, or unset all mean live mode. Live mode requires `EXPO_PUBLIC_API_BASE_URL`; missing → `authedFetch` returns `NO_SESSION`. Use fixture mode for offline dev / storybook work; leave unset elsewhere. (Originally gated on `!EXPO_PUBLIC_API_BASE_URL` during the parallel-build phase; flipped during TAC-270 cutover so prod and CI never accidentally fall back to fixtures when the API URL is misconfigured.)
- Supabase env vars: `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (required; `lib/supabase/client.ts` throws at module load if either is missing). Copy `.env.example` → `.env.local` and fill.
- Auth: Supabase session JWT in `Authorization: Bearer <token>` header — wired via `authedFetch` in `lib/api/client.ts`. One refresh-and-retry on 401/403, then `NO_SESSION`. Never loops. API client never navigates; auth redirects belong to the global session listener.
- Errors-as-values shape: every `lib/api/*` function returns `{ ok: true, data }` or `{ ok: false, error: ApiError }`. `ApiError` is one of `NO_SESSION | HTTP | NETWORK | PARSE`. Current callers treat all `HTTP` as retryable — comment in `parseHttpError` if that taxonomy needs to grow.

## Workflow rules for Claude Code

- Always show me the plan before writing code I haven't asked for
- For any new file, propose the path first
- When unsure about product behavior, ask — do not guess
- Commit messages: lowercase, imperative ("add otp sign-in screen"), no emoji
- Don't run the app yourself — Jaipal runs it locally to verify on his iPhone via Expo Go (Phase 1) or dev client (later)
- Don't add native modules that break Expo Go compatibility without explicit approval
- Don't add new dependencies without listing them in the plan first
- After any rebase or merge that touches `app/_layout.tsx` or other app-root wiring, flag that an on-device smoke test (cold launch + queue swipe) is required — unit tests do not catch gesture-handler root-view regressions or other native-host wrapper drops

## High-stakes flags

(Carried over from analog-guest convention.) If a ticket touches any of these, the comment marker becomes `[HUMAN-REVIEW-REQUIRED]` instead of `[NEEDS-INPUT]`:

- Auth (Supabase session, JWT handling, deep link callbacks)
- Anything that sends a message via the API (operator approve/edit/skip/undo → reaches Sendblue downstream)
- Anything that writes to operator's session storage (Expo SecureStore)
- Anything that touches push notification entitlements or APNs configuration

## Common gotchas

(Will grow as we hit them. Seed entries:)

- **NativeWind v4** — hover variants don't apply on RN; if you reach for `hover:` instinctively, stop. State-dependent styling uses Pressable's `style` prop with a function, or inline conditional style. No `hover:text-clay` patterns.
- **Expo Go limitations** — Phase 1 of TAC-112 runs in Expo Go, which means no custom native modules. Anything requiring a config plugin or native code needs a dev client build (deferred until Apple Dev account is enrolled).
- **Font loading discipline** — fonts must be loaded via `expo-font` + `useFonts` hook. Block app render with `SplashScreen.preventAutoHideAsync()` until loaded, or you'll see system fonts flash on cold start.
- **expo-router file paths matter** — `app/index.tsx` is the home route; `app/_layout.tsx` is the layout wrapper. Don't rename or move these without understanding the routing implications.
- **Inline style for state-dependent colors** — don't use `hover:text-token` patterns (see above). Same applies to any focused/pressed/disabled state styling: pass an inline style or use the Pressable `style` function.
- **Reanimated 4 babel plugin** — Expo SDK 54 ships `react-native-reanimated` v4, which splits worklet handling into a separate `react-native-worklets` package. The babel plugin to add (last in the plugins array) is `react-native-worklets/plugin`, NOT the older `react-native-reanimated/plugin`. Older docs and tutorials still reference the latter; ignore them.
- **NativeWind v4 pin on Tailwind v3** — NativeWind v4 currently requires `tailwindcss` v3.x. Do not bump `tailwindcss` to v4 — NativeWind doesn't support it yet, and the bump silently breaks utility resolution at runtime.
- **jest-expo preset, no custom `transformIgnorePatterns`** — `package.json`'s `jest` block only sets `preset: jest-expo` plus a `setupFiles` entry pointing at `jest.setup.js`. Don't reintroduce a custom `transformIgnorePatterns` override — the preset already handles RN + Expo + reanimated/worklets correctly, and any hand-rolled regex drifts out of date the moment a new package is added. `jest.setup.js` stubs `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` so the `lib/supabase/client.ts` module-load throw doesn't crash the suite.
- **Always `npx expo install <pkg>` for Expo-namespaced packages.** Plain `npm install expo-secure-store` pulls the latest npm version (e.g. v55 at the time of TAC-206), which can be a major-version ahead of what the current SDK supports. `npx expo install` resolves against the SDK's compatibility metadata. If you accidentally use `npm install`, `npx expo install --check` will flag the drift.
- **Auth (Supabase + Expo SecureStore)** — four footguns to remember:
  1. SecureStore storage adapter must be async — `getItemAsync` / `setItemAsync` / `deleteItemAsync` all return promises. Match the `SupportedStorage` shape from `@supabase/auth-js`; no `as any`. See `lib/supabase/client.ts`.
  2. AppState wiring is mandatory for token refresh in the background. `supabase.auth.startAutoRefresh()` / `stopAutoRefresh()` must be called on AppState `active` / non-`active` transitions. See `lib/auth/app-state.ts`. Without this, the session looks fine until the access token silently expires.
  3. Magic-link tokens live in the URL fragment (`#access_token=…&refresh_token=…`), not the query string. Parse via `url.split('#')[1]` then `URLSearchParams`. `Linking.parse(url).queryParams` does not expose fragment params.
  4. Deep-link prod shape (`analog-operator://auth/callback`) only surfaces in a dev-client / TestFlight build. Under Expo Go the redirect URL is `exp://…/--/auth/callback`. `lib/auth/dev-log.ts` console-logs `Linking.createURL('auth/callback')` once on app boot so you can eyeball the resolved shape on first launch of a new build flavor.
- **Typed routes wired into `npm run typecheck`.** `npm run typecheck` runs `node regen-typed-routes.cjs && tsc --noEmit`. The regen script rebuilds `.expo/types/router.d.ts` so route-string validation in tsc covers the current set of `app/**` files. Without it, CI typecheck either falls back to permissive route types (if the file is absent) or fails on stale ones (if you ran `expo start` once, then renamed/added a route). The script lives at the repo root and is the same logic Metro runs at `expo start`.
- **Zod 4 strict UUID validation.** `z.string().uuid()` in Zod 4 enforces the canonical UUIDv1–v8 regex including the variant nibble (`[89abAB]` in position 14). Test fixtures of the form `11111111-1111-1111-1111-111111111111` are rejected because the variant char is `1`. Use real-looking UUIDv4s in fixtures (e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479`) or use `crypto.randomUUID()`. Hermes's `crypto.randomUUID()` isn't reliably available, so `lib/fixtures/queue.ts` hand-rolls a `fixtureUuid()` using `Math.random` — non-cryptographic, fine for seed data; do NOT use it outside fixtures.
- **AsyncStorage key namespacing.** Keys are prefixed `analog-operator.<area>.v<n>` (e.g. `analog-operator.undo-state.v1`). Bump the `v` when the stored shape changes; never silently re-parse a different shape against the same key.
- **Fixture-mode boundary.** `EXPO_PUBLIC_USE_FIXTURES === 'true'` = fixture mode (strict-true). `lib/api/queue.ts` exports `isFixtureMode()` and uses it to route to `lib/fixtures/queue.ts`; `lib/realtime/queue-channel.ts` does the same for the realtime channel. UI hooks/components above never check the env var directly. (TAC-270 flipped the gate from `!EXPO_PUBLIC_API_BASE_URL` so a missing/typo'd API base URL fails closed instead of silently demoting to fixtures.)
- **Realtime subscription scoping (v1, no RLS).** `lib/realtime/queue-channel.ts` opens postgres_changes on `messages` with a server-side `venue_id=in.(operator_allowlist)` filter — that filter is the *only* thing keeping cross-venue events out of an operator's stream until RLS lands (TAC-271). The allowlist comes from `lib/auth/operator.ts` `fetchOperatorVenueIds()`, which reads `operator_venues` directly via the Supabase client (also unprotected in v1). Two related quirks: (a) Supabase Realtime accepts only ONE filter clause per `.on()` call, so `direction === 'outbound'` is post-filtered in JS — `review_state` is intentionally NOT filtered so pending → sent/skipped/approved transitions still trigger a refetch (those drop the card from the queue); (b) the raw `messages` payload doesn't carry the JOINed `PendingDraft` fields (guest, recognition, context), so the consumer reloads the queue on every `queue_changed` event rather than merging. `supabase.realtime.setAuth(jwt)` is called inside `useQueueRealtime` on mount with the current token — token refresh while the queue is open re-runs the effect and re-creates the channel; the cost is one re-subscribe per refresh, acceptable at pilot session length. **`setAuth` mutates the shared `supabase.realtime` singleton — every realtime channel in the app gets whichever token was set last. Today only the queue channel exists, so this is fine; if you add a second concurrent realtime subscription, plumb the JWT to both call sites so neither stomps on the other.** (TAC-270.)
- **Gesture worklets.** `react-native-reanimated` v4 + `react-native-gesture-handler` are the gesture/animation stack. UI-thread callbacks (`onUpdate`, `onEnd`) need a `'worklet';` directive; cross to JS thread via `runOnJS(...)`. Gesture math thresholds, durations, and easings live in `lib/theme.ts` (`swipe`, `editTakeover`, `undoToast`, `peekCard`, `easing`), NOT in tailwind tokens.
- **`SafeAreaView` import.** Always import `SafeAreaView` from `react-native-safe-area-context`, never from `react-native`. The deprecated RN `SafeAreaView` is `RCTSafeAreaView` on iOS, whose native layout pass produces a hit-test rect that diverges from React's reported layout — views render visibly but receive no touches even though no parent has `pointerEvents` configured. The RN deprecation warning is the smoking gun. Fix: switch the import and ensure the app root is wrapped in `<SafeAreaProvider>`. (TAC-37; fix PR #10.)
- **`Pressable` inside `GestureDetector`.** Never wrap a `Pressable` (or `TouchableOpacity` / `TouchableHighlight`) inside a `GestureDetector`. RN's responder system claims the touch for the Pressable before gesture-handler can recognize the gesture — killing both the pan AND any tap composed with it. If you need a tap, hoist it into the gesture via `Gesture.Tap()` and compose with `Gesture.Exclusive(pan, tap)`. (TAC-37.)
- **`collapsable={false}` on gesture targets.** Always set `collapsable={false}` on the `View` / `Animated.View` directly wrapped by a `GestureDetector`. RN flattens views that have no native interactable descendant; gesture-handler's ref then resolves to nothing and gestures die silently — the component renders fine, unit tests pass, but no touches register. Removing a `Pressable` (per the previous gotcha) is the common trigger because the Pressable provided implicit collapse-prevention. (TAC-37; fix PR #9.)
- **Module-level timers + subscriber refcount.** If you write a singleton-style emitter (`showToast`, `setUndoState`, etc.) that schedules a module-level `setTimeout`, dispose the timer in the consumer hook's effect cleanup when `subscribers.size === 0`, AND early-return from the emitter when no subscribers are mounted — otherwise tests that exercise a screen without mounting the root subscriber leak the timer and Jest force-exits the worker. `.unref()` is the wrong tool here; explicit `clearTimeout` keyed off the subscriber count is the pattern. See `hooks/use-undo-state.ts` and `components/auth/toast.tsx`. (TAC-266.)
- **Tolerant Zod chains during cross-repo rollouts.** When the client needs to consume a new field that `analog-guest` is adding in a sibling ticket, ship the schema as `z.string().nullable().optional().default(null)` (or the same shape for other types) with an inline comment naming both tickets and the planned tighten. A strict `.nullable()` during the rollout window crashes queue parsing with `PARSE` errors the moment the operator app deploys ahead of the server change. Tighten to `.nullable()` only once both sides are live — file a follow-up at the time of the tolerant landing so it doesn't drift. See `lib/api/queue.ts::PendingDraftSchema.agentReasoning`. (TAC-276 ↔ TAC-278.)
- **`font-fraunces` is intrinsically italic.** `tailwind.config.js` maps `font-fraunces` to `Fraunces_400Regular_Italic` — it's the only Fraunces variant loaded. Don't stack an `italic` className on top (it's a no-op) and don't reach for `font-fraunces-roman` (it doesn't exist). If you need an upright serif, load a new font weight via `useFonts` and add it to the theme; don't pretend the existing one is dual-use. (TAC-276 review.)

## Conventions inherited from `analog-guest`

- High-stakes flag convention (above)
- Plan → Review → Build → Review → Commit cadence
- Linear ticket template (Background / User-facing behavior / Technical approach / Acceptance criteria / Testing / Out of scope / Notes for Claude Code)
- Ticket prefix `TAC-` (not `THE-`)
- Sub-agents at `.claude/agents/`, slash commands at `.claude/commands/`

## What lives where (cross-repo)

- **In `analog-operator` (this repo):** RN screens, gestures, animations, mobile-specific UI logic, API client wrapper, Supabase auth session handling
- **In `analog-guest`:** the messaging engine, all agent runtime, database, migrations, operator-facing API endpoints (TAC-258), the Sendblue integration, all PostHog events, voice corpus management

If a build needs work in both repos (e.g. a new operator API endpoint + the UI that calls it), it gets split into two tickets — one per repo. See TAC-37 (UI) and TAC-258 (API) as the canonical example.
