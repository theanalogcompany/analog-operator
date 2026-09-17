/**
 * The ticket workflows can only be exercised end to end after they merge —
 * claude-code-action skips itself when the workflow file differs from main's
 * copy (see build-ready.yml's header). That makes a static test of their
 * routing logic more valuable here, not less: this file is the only thing
 * that can fail before a merge.
 *
 * It runs the workflows' OWN extracted jq, not a TypeScript reimplementation
 * of it. A reimplementation would only ever confirm this file agrees with
 * itself, which is the defect CLAUDE.md's "never mock the layer whose
 * behavior you are claiming" entry is about. (TAC-439.)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = join(__dirname, '..');
const BUILD = join(ROOT, '.github/workflows/build-ready.yml');
const AUDIT = join(ROOT, '.github/workflows/audit-new-todo.yml');

const read = (p: string) => readFileSync(p, 'utf8');

/** The `RULES='…'` heredoc each workflow passes to jq, dedented. */
function extractRules(source: string): string {
  const m = /RULES='\n([\s\S]*?)\n\s*'\n/.exec(source);
  if (!m) throw new Error('no RULES block found');
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
}

/** The repo-rule defs both workflows must carry identically. */
const SHARED_DEFS = ['repo_labels', 'repo_line_names', 'owner'] as const;

function extractDef(rules: string, name: string): string {
  const start = rules.indexOf(`def ${name}:`);
  if (start === -1) throw new Error(`def ${name} not found`);
  const end = rules.indexOf('\ndef ', start + 1);
  return rules.slice(start, end === -1 ? undefined : end).trim();
}

type Ticket = { labels: string[]; repoLine: string };

function ticket({ labels, repoLine }: Ticket) {
  return {
    identifier: 'TAC-TEST',
    labels: { nodes: labels.map((name) => ({ name })) },
    description: `**[FROM CLAUDE CODE]**\n\n**Repo:** ${repoLine}\n\nbody\n`,
    comments: { nodes: [] },
  };
}

/**
 * The jq program goes to a real file, never `-f /dev/stdin`.
 * `execFileSync`'s `input` hands the child a pipe and closes the write end
 * before jq runs. macOS opens `/dev/stdin` against that pipe happily; Linux
 * resolves it through `/proc/self/fd/0` and fails with ENXIO —
 * `jq: Could not open /dev/stdin: No such device or address`. So the first
 * version of this file passed on a Mac and failed every jq-backed case in
 * CI. A temp file has no platform-dependent behaviour to get wrong.
 */
function evalOn(rules: string, expr: string, _t: Ticket, repo = 'analog-operator'): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'tac439-jq-'));
  const program = join(dir, 'program.jq');
  try {
    writeFileSync(program, `${rules}\n${expr}`, 'utf8');
    const out = execFileSync('jq', ['-n', '-c', '--arg', 'repo', repo, '-f', program], {
      encoding: 'utf8',
    });
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ticket workflows', () => {
  const buildSrc = read(BUILD);
  const auditSrc = read(AUDIT);
  const rules = extractRules(buildSrc);

  const jobsOf = (src: string): string[] => {
    const doc = yaml.load(src);
    if (typeof doc !== 'object' || doc === null || !('jobs' in doc)) {
      throw new Error('workflow has no jobs block');
    }
    return Object.keys((doc as { jobs: Record<string, unknown> }).jobs);
  };

  it('both workflow files are valid YAML with the expected job', () => {
    expect(jobsOf(buildSrc)).toEqual(['build']);
    expect(jobsOf(auditSrc)).toEqual(['audit']);
  });

  // The two copies drifting is the failure TAC-439 exists to prevent, and
  // process.md's mirror-pair rule ("Which repo works a ticket") says the
  // shared blocks must be identical. A claim like that is checkable, so it is
  // checked rather than asserted. These defs are also shared with
  // analog-guest, which nothing here can check: a run reaches only its own
  // repo, so that half is a copy-verbatim discipline, not a test.
  it.each(SHARED_DEFS)('the %s def is identical in both workflows', (name) => {
    const auditRules = extractRules(auditSrc);
    expect(extractDef(auditRules, name)).toBe(extractDef(rules, name));
  });

  describe('owner', () => {
    const cases: Array<{ name: string; t: Ticket; owner: string }> = [
      {
        name: 'single label, Repo: line naming only it — the ordinary ticket',
        t: { labels: ['analog-operator'], repoLine: '`analog-operator`' },
        owner: 'analog-operator',
      },
      {
        // TAC-439's own shape. A line naming two repos is a defect whatever
        // the labels say; before this, owner silently picked analog-guest and
        // analog-operator never saw the ticket.
        name: 'Repo: line naming two repos — defect, whatever the labels say',
        t: { labels: ['analog-guest'], repoLine: '`analog-guest` and `analog-operator`' },
        owner: 'defect:multi-repo-line',
      },
      {
        name: 'two repo labels — the pre-existing defect, unchanged',
        t: { labels: ['analog-guest', 'analog-operator'], repoLine: '`analog-guest`' },
        owner: 'analog-guest',
      },
      {
        name: 'Repo: line naming one repo the ticket is not labelled for',
        t: { labels: ['analog-operator'], repoLine: '`analog-guest`' },
        owner: 'defect:unlabelled',
      },
      {
        name: 'prose mentioning the sibling stays off the Repo: line',
        t: { labels: ['analog-operator'], repoLine: "`analog-operator`\n\nThe analog-guest half is TAC-428." },
        owner: 'analog-operator',
      },
    ];

    it.each(cases)('$name', ({ t, owner }) => {
      expect(evalOn(rules, `${JSON.stringify(ticket(t))} | owner`, t)).toBe(owner);
    });
  });

  describe('what the build selects and what it refuses', () => {
    // Mirrors build-ready.yml's SELECTED filter and the half-routed arm of
    // its DEFECTS filter. Both read the defs above.
    const selects = (t: Ticket, repo: string) =>
      evalOn(
        rules,
        `${JSON.stringify(ticket(t))} | (owner == $repo and (repo_labels|length) == 1)`,
        t,
        repo,
      );
    const refused = (t: Ticket) =>
      evalOn(rules, `${JSON.stringify(ticket(t))} | (owner | startswith("defect:"))`, t);

    const ordinary: Ticket = { labels: ['analog-operator'], repoLine: '`analog-operator`' };
    const half: Ticket = { labels: ['analog-guest'], repoLine: '`analog-guest` and `analog-operator`' }; // multi-repo line
    const unlabelled: Ticket = { labels: ['analog-operator'], repoLine: '`analog-guest`' };

    it('builds an ordinary ticket', () => {
      expect(selects(ordinary, 'analog-operator')).toBe(true);
      expect(refused(ordinary)).toBe(false);
    });

    it('refuses a multi-repo-line ticket and builds it in neither repo', () => {
      expect(selects(half, 'analog-guest')).toBe(false);
      expect(selects(half, 'analog-operator')).toBe(false);
      expect(refused(half)).toBe(true);
    });

    it('still refuses a Repo: line naming no labelled repo', () => {
      expect(selects(unlabelled, 'analog-operator')).toBe(false);
      expect(refused(unlabelled)).toBe(true);
    });
  });
});
