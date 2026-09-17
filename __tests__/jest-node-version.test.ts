import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import { checkNodeVersion } from '../jest.node-version';

/**
 * Jest refuses to run on a Node major other than `.nvmrc`'s. (TAC-427.)
 *
 * These pin the decision and the wiring separately. A check that is correct
 * but no longer wired as `globalSetup` would pass every decision test here and
 * guard nothing, so the wiring has its own test.
 */
const ROOT = resolve(__dirname, '..');

describe('checkNodeVersion', () => {
  it.each([
    ['22', '22.23.2'],
    ['22\n', '22.0.0'],
    ['v22', '22.9.1'],
    ['22.x', '22.1.0'],
    ['22.23.2', '22.4.0'],
  ])('passes when .nvmrc %j and Node %s share a major', (nvmrc, node) => {
    expect(checkNodeVersion(nvmrc, node)).toEqual({ ok: true });
  });

  it('fails a different major, naming both versions and the fix', () => {
    const result = checkNodeVersion('22\n', '25.9.0');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('This is Node 25.9.0, and .nvmrc says 22');
    expect(result.message).toContain('not evidence about CI');
    expect(result.message).toContain('Install Node 22');
  });

  it('fails an older major too, not only a newer one', () => {
    expect(checkNodeVersion('22', '20.11.1').ok).toBe(false);
  });

  it('fails when .nvmrc names no version, rather than passing everything', () => {
    const result = checkNodeVersion('lts/*', '22.23.2');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('.nvmrc does not name a Node version');
  });
});

describe('the wiring', () => {
  it('runs the check as Jest globalSetup', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.jest.globalSetup).toBe('<rootDir>/jest.node-version.js');
  });

  it("reads a .nvmrc that names a version, so the check is not vacuous", () => {
    const nvmrc = readFileSync(join(ROOT, '.nvmrc'), 'utf8');
    expect(checkNodeVersion(nvmrc, process.versions.node)).toEqual({ ok: true });
  });
});
