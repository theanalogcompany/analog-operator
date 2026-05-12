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
- `hooks/` — custom React hooks
- `assets/` — fonts, images, icons
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
- Auth: Supabase session JWT in `Authorization: Bearer <token>` header
- A typed API client will live at `lib/api/` (to be built in TAC-206 / TAC-37 — not yet)

## Workflow rules for Claude Code

- Always show me the plan before writing code I haven't asked for
- For any new file, propose the path first
- When unsure about product behavior, ask — do not guess
- Commit messages: lowercase, imperative ("add otp sign-in screen"), no emoji
- Don't run the app yourself — Jaipal runs it locally to verify on his iPhone via Expo Go (Phase 1) or dev client (later)
- Don't add native modules that break Expo Go compatibility without explicit approval
- Don't add new dependencies without listing them in the plan first

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
- **jest-expo preset, no custom `transformIgnorePatterns`** — `package.json`'s `jest` block only sets `preset: jest-expo`. Don't reintroduce a custom `transformIgnorePatterns` override — the preset already handles RN + Expo + reanimated/worklets correctly, and any hand-rolled regex drifts out of date the moment a new package is added.

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
