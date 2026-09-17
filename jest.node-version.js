/**
 * Jest refuses to run on a Node major version other than `.nvmrc`'s. (TAC-427.)
 *
 * A local pass on a different runtime than CI is not evidence. CI's setup-node
 * reads `.nvmrc`, so a test that breaks on that version can still pass locally
 * on another one. It did: `auth-frame.test.tsx` hung on Node 22 and passed on
 * Node 25, and every CI run sat in its test step for six hours, for three days,
 * while local runs said the suite was green.
 *
 * Wired as Jest's `globalSetup`, so it runs once before any test file, locally
 * and in CI alike. A hard failure rather than a warning: a warning would leave
 * a local pass meaning something different from a CI pass, which is the defect.
 */
const { readFileSync } = require('fs');
const { join } = require('path');

/** The leading major version in "22", "v22", "22.x" or "22.23.2", or null. */
function majorOf(version) {
  const match = /^\s*v?(\d+)/.exec(String(version));
  return match ? Number(match[1]) : null;
}

/**
 * Whether a run on `nodeVersion` means what CI's run on `.nvmrc` means.
 * Returns the message to fail with when it does not.
 */
function checkNodeVersion(nvmrc, nodeVersion) {
  const wanted = majorOf(nvmrc);
  if (wanted === null) {
    return {
      ok: false,
      message:
        `.nvmrc does not name a Node version ("${String(nvmrc).trim()}"), so this ` +
        'test run cannot be checked against the version CI runs.',
    };
  }
  if (majorOf(nodeVersion) === wanted) return { ok: true };
  return {
    ok: false,
    message:
      `This is Node ${nodeVersion}, and .nvmrc says ${wanted}, which is what CI runs. ` +
      'A test run on a different Node major is not evidence about CI, so Jest will not run. ' +
      `Install Node ${wanted} and switch to it (for example \`brew install fnm\`, then ` +
      '`fnm use` in this repo), then run the tests again.',
  };
}

module.exports = async function assertNodeVersionMatchesNvmrc(globalConfig, projectConfig) {
  const nvmrc = readFileSync(join(projectConfig.rootDir, '.nvmrc'), 'utf8');
  const result = checkNodeVersion(nvmrc, process.versions.node);
  if (!result.ok) throw new Error(result.message);
};
module.exports.checkNodeVersion = checkNodeVersion;
