# analog-operator

The operator-facing native mobile app for [Analog](https://theanalog.company) — a guest recognition platform for independent cafes, bakeries, and restaurants. Operators use this app to review and approve AI-drafted iMessage/SMS replies before they ship to guests.

The messaging engine, database, and operator-facing API endpoints live in the sibling `analog-guest` repo. This repo is the mobile client only.

## Stack

- Expo SDK 54 + React Native 0.81 + TypeScript
- [expo-router](https://docs.expo.dev/router/introduction/) for file-based routing
- [NativeWind v4](https://www.nativewind.dev/) (Tailwind-for-RN) for styling — Tailwind v3 under the hood (NativeWind v4 does not yet support Tailwind v4)
- `react-native-reanimated` + `react-native-gesture-handler` for animation and gesture primitives (installed; real usage starts in TAC-37)
- `expo-font` + `@expo-google-fonts/*` for Fraunces and Inter Tight
- jest-expo + `@testing-library/react-native` for unit tests

## Prerequisites

- Node 22 (LTS) — see [.nvmrc](.nvmrc). If you use `nvm`, run `nvm use` from the repo root
- npm 10+
- [Expo Go](https://expo.dev/go) installed on your iPhone (Phase 1 — see TAC-112)

## Dev setup

```bash
git clone git@github.com:theanalogcompany/analog-operator.git
cd analog-operator
nvm use            # optional, picks up .nvmrc
npm install
npm start
```

Then scan the Metro QR code with the iOS Camera app, which opens Expo Go and loads the app on your phone.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start Metro and open the dev menu |
| `npm run ios` | Open in the iOS Simulator (requires Xcode) |
| `npm run android` | Open in the Android emulator (requires Android Studio) |
| `npm run web` | Open in the browser (web is for tooling only — not a deployment target) |
| `npm run lint` | Run `expo lint` (eslint with `eslint-config-expo`) |
| `npm test` | Run the jest test suite |
| `npx tsc --noEmit` | Typecheck without emitting build output |

## Project structure

```
app/                  expo-router file-based routes (one file = one screen)
  _layout.tsx         root layout: font loading + splash-screen gating
  index.tsx           placeholder home screen (TAC-112 hello-world)
__tests__/            unit tests (jest-expo preset)
.github/workflows/    CI: typecheck + lint + test on PR
app.json              Expo config: bundle id, scheme, plugins
tailwind.config.js    NativeWind/Tailwind config with brand tokens
babel.config.js       babel-preset-expo + nativewind/babel + worklets plugin
metro.config.js       Metro wrapped with NativeWind
global.css            Tailwind directives, imported once in _layout.tsx
```

`components/`, `hooks/`, and `lib/` will appear as they're needed — see [CLAUDE.md](CLAUDE.md).

## Deep link scheme

`analog-operator://` — declared in [app.json](app.json). Used for OAuth callbacks and push deep links in later tickets (TAC-206, TAC-207).

## Environment variables

None are required for Phase 1. See [.env.example](.env.example) for the list of vars that future tickets will introduce. All app-side env vars must be prefixed with `EXPO_PUBLIC_`.

## API

This app calls operator-facing endpoints from `analog-guest`. The API client and base-URL wiring land in TAC-37 / TAC-206 / TAC-258.

## Workflow

This repo follows the conventions in [CLAUDE.md](CLAUDE.md): plan → review → build → review → commit, with Linear-driven ticket flow. Slash commands and sub-agents live under [.claude/](.claude/).
