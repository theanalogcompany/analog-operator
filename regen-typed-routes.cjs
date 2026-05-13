// Regenerate .expo/types/router.d.ts so route-string validation in tsc covers
// the current set of app/** route files. Mirrors what Metro runs at `expo
// start`, but works standalone (e.g. in CI typecheck) without launching the
// dev server.
//
// Wired into `npm run typecheck` so CI always typechecks against fresh routes.

const path = require('path');
const fs = require('fs');
const requireContext =
  require('expo-router/build/testing-library/require-context-ponyfill').default;
const { regenerateDeclarations } = require('expo-router/build/typed-routes');

const appDir = path.join(process.cwd(), 'app');
const ctx = requireContext(appDir, true, /\.(js|jsx|ts|tsx)$/);

function walk(dir, base = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.posix.join(base, entry.name);
    if (entry.isDirectory()) {
      walk(full, rel);
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      ctx.__add('./' + rel);
    }
  }
}
walk(appDir);

const outDir = path.join(process.cwd(), '.expo', 'types');
fs.mkdirSync(outDir, { recursive: true });
regenerateDeclarations(outDir, { partialTypedGroups: false }, ctx);
