import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';

/**
 * Jest must never collect a test from `.claude/`. (TAC-388.)
 *
 * A git worktree left under `.claude/worktrees/` is a full checkout, so Jest
 * collected every test in it and each local run executed the suite twice. It
 * was worse than a slow run: `moduleNameMapper` maps `@/` to THIS checkout's
 * root, so a worktree that had drifted onto another branch ran that branch's
 * tests against this checkout's code. CI runs on a clean checkout and never saw
 * it.
 *
 * This asks Jest itself which files it would run, rather than reading the
 * config. A pattern that is present but wrong would pass a config read and
 * still collect the worktree; this can only pass if collection skips it.
 */
const ROOT = resolve(__dirname, '..');
const WORKTREES = join(ROOT, '.claude', 'worktrees');
const PROBE_ROOT = join(WORKTREES, 'jest-ignore-probe');
const JEST_BIN = join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');

function listTests(): string[] {
  return execFileSync(process.execPath, [JEST_BIN, '--listTests'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe('Jest test collection', () => {
  // Only a folder this test created is removed afterwards, and only while empty.
  let createdWorktrees = false;

  beforeAll(() => {
    createdWorktrees = !existsSync(WORKTREES);
    const dir = join(PROBE_ROOT, '__tests__');
    mkdirSync(dir, { recursive: true });
    // Throws if it ever runs, so a collected probe cannot pass quietly either.
    writeFileSync(
      join(dir, 'probe.test.ts'),
      "it('is never collected', () => { throw new Error('collected from .claude/'); });\n",
    );
  });

  afterAll(() => {
    rmSync(PROBE_ROOT, { recursive: true, force: true });
    if (createdWorktrees && existsSync(WORKTREES)) rmdirSync(WORKTREES);
  });

  it('never collects a test from a worktree under .claude/', () => {
    const files = listTests();
    // Guards the guard: an empty or failed listing would pass the check below.
    expect(files.some((file) => file.endsWith(join('__tests__', 'jest-config.test.ts')))).toBe(
      true,
    );
    expect(files.filter((file) => file.includes(`${sep}.claude${sep}`))).toEqual([]);
  }, 60_000);
});
