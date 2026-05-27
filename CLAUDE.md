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
- `eas.json` — EAS Build + EAS Submit configuration (development / preview / production profiles). See README's "TestFlight + EAS Build" section.
- `.github/workflows/eas-build-preview.yml` — fires `eas build --profile preview` on every PR against `main`. Requires `EXPO_TOKEN` GH Actions secret.

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

## Cross-repo contracts

This app and `analog-guest` ship features together — operator endpoints land server-side first, then the client consumes them. Every cross-repo ticket pair (sibling pattern, e.g. TAC-207 ↔ TAC-288) follows these rules. Background: the TAC-207/TAC-288 push-notifications build burned 9 hours of debugging across multiple sessions because the client and server each implemented their own internally-consistent interpretation of an unwritten contract. These rules exist to prevent the next instance of that.

1. **The `## Contract` section is the single source of truth.** Any cross-repo ticket MUST contain a `## Contract` block in the ticket description that locks: endpoint path (character-exact, including singular vs plural, leading slash), request body shape with a concrete example, response shape per status code, and required env vars with format notes (e.g. base64-DER vs raw, with-or-without dashes, plaintext vs JSON-string-escaped). If the Contract lives on one sibling, the other ticket links to it. Treat this section as authoritative — code matches the Contract, not the other way around.

2. **No silent divergence.** If implementation needs to deviate from the Contract to match a codebase convention (singular `operator/` vs plural, snake_case vs camelCase, etc.), the ticket description is updated FIRST during plan review; the sibling ticket is updated in lockstep. Implementation never silently diverges with an "I chose X to match convention" justification while the Contract still says Y. The Contract reflects the decision, then code lands.

3. **Server-first, sequential rollout.** Before touching client code in `analog-operator`, the `analog-guest` endpoint must be deployed AND verified via `curl` against the Contract section's exact request shape. Parallel development against an unverified contract is the documented root cause of the TAC-207/TAC-288 debugging sessions. The tolerant-Zod pattern under "Common gotchas" is the narrow exception (additive nullable fields), not a license to develop both sides in parallel.

4. **Manual end-to-end UAT is a Done gate.** Unit tests passing on both sides proves each side is internally consistent with its own assumption of the contract — it does not prove the assumptions match. A cross-repo ticket cannot move to Done on unit-test pass alone; the operator runs the cross-repo flow on device (TestFlight for push, dev client for native-module paths) and confirms behavior end-to-end before close. UAT is NOT deferred to the sibling ticket — both tickets share the gate.

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
- **EAS owns `ios.buildNumber` (and `android.versionCode`).** `eas.json` sets `cli.appVersionSource: "remote"` + `build.production.autoIncrement: true`, so EAS tracks the version values server-side and auto-increments them per production build (iOS → buildNumber, Android → versionCode — platform behavior is implicit from the field, not configured by name). **Don't add `ios.buildNumber` to `app.json`** — under `remote` mode the local value is redundant and the Expo docs explicitly say "you can safely remove these values from your app config." If you genuinely need to seed a non-zero starting buildNumber, do it server-side once with `eas build:version:set --platform ios`, not by hand-editing `app.json`. `expo.version` (semver) stays manual in `app.json`: bump intentionally per release. (TAC-259.)
- **Apple identifiers are locked.** Bundle ID `company.theanalog.operator` (matches `app.json` `ios.bundleIdentifier` AND `android.package` — keep them aligned) and Apple Team ID `W4J9A9K9YX` (referenced in `eas.json` `submit.production.ios.appleTeamId`) are tied to the App Store Connect record (App ID `6773470707`). Renaming any of these breaks signing and TestFlight delivery. If a future ticket genuinely needs a bundle-ID change, it's an App Store Connect re-provisioning exercise, not a code change. (TAC-259.)
- **`.p8` keys never enter the repo.** `.gitignore` already lists `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`. The ASC API key + APNs auth key live in Jaipal's 1Password, uploaded to EAS via `eas credentials` (interactive, once) or referenced via EAS secrets — never hardcoded in `eas.json`, never committed, never pasted into Linear or chat. If you find yourself wanting to commit a `.p8` "just to test something," stop. (TAC-259.)
- **`eas.json` `autoIncrement` is a boolean, not a string.** Use `"autoIncrement": true`, not `"autoIncrement": "buildNumber"` — current EAS CLI schema rejects the string form. The platform-specific behavior is implicit from the build profile (iOS bumps buildNumber, Android bumps versionCode). Older Expo docs and blog posts still show the string form; ignore them. (TAC-259 UAT.)
- **First `eas build` after adding a `channel` field auto-installs `expo-updates`.** EAS Build sees `channel` in `eas.json`, adds `expo-updates` to `package.json` + writes the `updates` / `runtimeVersion` blocks into `app.json`, then errors with *"Installed expo-updates and configured EAS Update. Command must be re-run to pick up new updates configuration."* This is expected — re-run the build command, the second attempt succeeds. One-time event per project; once those blocks exist, future builds skip the auto-config step. Don't panic-strip the `channel` field. (TAC-259 UAT.)
- **`.env.local` does NOT bundle into EAS production builds.** Local `.env.local` is for `npm start` / `expo start` only — EAS ignores it. A production build whose code reads `EXPO_PUBLIC_SUPABASE_URL` (or any other `EXPO_PUBLIC_*`) will see `undefined` and crash on cold launch (Supabase client throws at module load, see `lib/supabase/client.ts`). Sync env vars to EAS via the [expo.dev dashboard → Project → Environment Variables](https://docs.expo.dev/eas/environment-variables/) (or `eas env:create`), scoped to the `production` environment. **Before the first production build of any feature that touches new env vars, sync them.** Same applies to `preview` if PR builds need to hit a real backend. (TAC-259 UAT.)
- **OTA runtime version policy is `appVersion`.** `app.json` sets `runtimeVersion.policy: "appVersion"`, so EAS Update buckets OTA updates by `expo.version` (semver). Bumping `expo.version` cuts a fresh OTA bucket — only builds with a matching semver receive the update. EAS Update isn't actively used yet (channel field is pre-wired, no `eas update` runs in CI), but the policy is set so the first OTA push works without re-config. If native modules start churning, consider swapping to `fingerprint` policy (tracks the native-module fingerprint, not semver); it's a one-line `app.json` swap when the time comes. Don't reach for `sdkVersion` — deprecated. (TAC-259 UAT.)
- **APNs entitlement (`aps-environment`) is owned by the EAS-managed provisioning profile at codesign time, NOT by `app.json`.** Source of truth verified by inspecting build #6 (commit `d9e9dfb`) with `codesign -d --entitlements -` and `security cms -D -i embedded.mobileprovision`: both showed `aps-environment = production` even though `app.json` registers `expo-notifications` as a plain plugin string with no `mode` config. The plugin's iOS module ([node_modules/expo-notifications/plugin/build/withNotificationsIOS.js](node_modules/expo-notifications/plugin/build/withNotificationsIOS.js)) defaults `mode` to `'development'` and only writes when `aps-environment` is unset, but EAS's production-profile codesigning overrides the result with the value declared in the App Store distribution profile. **Practical rule:** for EAS production builds, this is a no-op decision — the profile wins. For dev-client / local prebuild paths, explicitly set `mode` in the plugin config if you need the dev environment. The PR #22 CLAUDE.md gotcha that claimed "EAS auto-injects based on build profile" was a hallucinated rationalization for skipping Jaipal's explicit `mode: "production"` instruction; the correct version is in this paragraph. (TAC-288 follow-up after UAT #2.)
- **`expo-notifications` push doesn't work in Expo Go.** Remote-push was deprecated in Expo Go on iOS as of SDK 53. Any feature using `getDevicePushTokenAsync` / APNs delivery / tap responses needs a dev client or TestFlight build to UAT — `npm start` + Expo Go cannot exercise the path. Local notifications (no APNs) still work in Expo Go, but TAC-288's full flow does not. (TAC-288.)
- **AsyncStorage dedupe for device-token registration.** `lib/notifications/token.ts` reads `analog-operator.notifications.last-registered-token.v1` before POSTing to `/api/operator/devices` — if the current token matches the stored one, the POST is skipped (Apple's "send only when changed" idiom). On register success the storage is updated; on failure (HTTP or NETWORK) it is NOT updated, so the next cold launch retries naturally. There is no client-side retry timer — cold-launch is the recovery surface (per TAC-207 settled-decision #7). Token rotation events from `addPushTokenListener` follow the same write-on-success pattern. Endpoint path follows the singular-`operator/` convention shared with `operator/messages`, `operator/queue`, etc. (TAC-288.)
- **Auth-gated push permission request lives in `app/_layout.tsx`, NOT `wireNotifications()`.** The iOS prompt fires from a `useEffect` in the root layout keyed on `session.status === 'signed-in'`, calling `requestPermissionIfUndetermined()`. `wireNotifications()` runs at root-boot before the auth gate resolves, and it only *reads* permission state (via `refreshPermissionStatus`) — it never asks. Putting the request inside `wireNotifications` would prompt unauthenticated visitors at sign-in screens; gating on `'signed-in'` is what makes the "first authenticated render" spec work for both the SecureStore auto-login path (loading → signed-in) and the SMS-OTP path (signed-out → signed-in). The shipped TAC-288 PR had a regression here — the helper existed but no effect invoked it, so the prompt never fired on TestFlight. Regression test lives at `__tests__/screens/root-layout.test.tsx`. (TAC-288 follow-up.)

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
