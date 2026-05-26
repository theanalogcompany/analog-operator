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
| `npm run build:preview` | Trigger an EAS Build preview build for iOS (internal distribution) |
| `npm run build:production` | Trigger an EAS Build production build for iOS (TestFlight-uploadable) |
| `npm run submit:production` | Submit the latest production build to TestFlight |

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

## TestFlight + EAS Build

Distribution to pilot operators (and Jaipal's iPhone) runs through [TestFlight](https://developer.apple.com/testflight/), driven by [EAS Build](https://docs.expo.dev/build/setup/) and [EAS Submit](https://docs.expo.dev/submit/ios/). Build config lives in [eas.json](eas.json). Apple credentials (Team ID, ASC App ID, ASC API key) are documented in the [TAC-259](https://linear.app/the-analog-company/issue/TAC-259) credentials comment; `.p8` keys live in Jaipal's 1Password and never enter the repo.

### Prerequisites

- Expo account (`eas login`) with access to the `analog-operator` project
- [EAS CLI](https://docs.expo.dev/eas-update/getting-started/) installed locally (`npm i -g eas-cli`)
- For CI preview builds: an `EXPO_TOKEN` GitHub Actions secret. A personal access token works for solo accounts; a [robot account](https://docs.expo.dev/accounts/programmatic-access/) token is preferred once we're on an Expo organization for audit-trail reasons. Store in repo Settings → Secrets and variables → Actions; never commit.

### One-time bootstrap (Jaipal)

```bash
eas login                                # auth the CLI to your Expo account
eas init                                 # link this repo to the EAS project; writes extra.eas.projectId to app.json
eas credentials                          # upload the ASC API .p8 + generate signing certs / provisioning profile (interactive)
```

After `eas init` writes `extra.eas.projectId` into `app.json`, stage and commit that change separately.

### Recurring loop

```bash
npm run build:production                 # cloud-build a TestFlight-eligible IPA on EAS
npm run submit:production                # upload latest production build to App Store Connect / TestFlight
```

TestFlight processing takes ~10–15 minutes after submit. Once the build shows "Ready to Submit" in App Store Connect → TestFlight and you've added it to your internal test group, it appears in the TestFlight app on your iPhone and is installable.

### Preview builds on PRs

[.github/workflows/eas-build-preview.yml](.github/workflows/eas-build-preview.yml) fires `eas build --platform ios --profile preview` on every pull request against `main`. Builds are installable via [Expo Orbit](https://expo.dev/orbit) or the build-page QR code. **Note:** PRs from forks don't have access to the `EXPO_TOKEN` secret, so preview builds will fail on forked-PR workflows — acceptable for the pilot since there are no external contributors.

### Bumping versions

- `ios.buildNumber` is owned by EAS (`appVersionSource: "remote"` + `autoIncrement: "buildNumber"` in [eas.json](eas.json)). Don't add it to `app.json` — the field is redundant under remote mode. If you ever need to seed a non-zero starting buildNumber, run `eas build:version:set --platform ios` once, server-side.
- `expo.version` (semver) stays manual in `app.json`. Bump intentionally per release (e.g., 0.1.0 → 0.2.0 when the pilot's feature set advances).

## Workflow

This repo follows the conventions in [CLAUDE.md](CLAUDE.md): plan → review → build → review → commit, with Linear-driven ticket flow. Slash commands and sub-agents live under [.claude/](.claude/).
