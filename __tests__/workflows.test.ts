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
import { readFileSync } from 'node:fs';
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
const SHARED_DEFS = ['repo_labels', 'repo_line_names', 'owner', 'named_unlabelled'] as const;

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

function evalOn(rules: string, expr: string, _t: Ticket, repo = 'analog-operator'): unknown {
  const out = execFileSync('jq', ['-n', '-c', '--arg', 'repo', repo, '-f', '/dev/stdin'], {
    input: `${rules}\n${expr}`,
    encoding: 'utf8',
  });
  return JSON.parse(out);
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
  // process.md's "Shared and per-repo blocks" declares these four identical.
  // A claim like that is checkable, so it is checked rather than asserted.
  it.each(SHARED_DEFS)('the %s def is identical in both workflows', (name) => {
    const auditRules = extractRules(auditSrc);
    expect(extractDef(auditRules, name)).toBe(extractDef(rules, name));
  });

  describe('owner and named_unlabelled', () => {
    const cases: Array<{ name: string; t: Ticket; owner: string; unlabelled: string[] }> = [
      {
        name: 'single label, Repo: line naming only it — the ordinary ticket',
        t: { labels: ['analog-operator'], repoLine: '`analog-operator`' },
        owner: 'analog-operator',
        unlabelled: [],
      },
      {
        // TAC-439's own shape: this is the defect the ticket was filed for.
        name: 'single label, Repo: line naming both repos — half-routed',
        t: { labels: ['analog-guest'], repoLine: '`analog-guest` and `analog-operator`' },
        owner: 'analog-guest',
        unlabelled: ['analog-operator'],
      },
      {
        name: 'two repo labels — the pre-existing defect, unchanged',
        t: { labels: ['analog-guest', 'analog-operator'], repoLine: '`analog-guest`' },
        owner: 'analog-guest',
        unlabelled: [],
      },
      {
        name: 'Repo: line naming no labelled repo — defect:unlabelled, not half-routed',
        t: { labels: ['analog-operator'], repoLine: '`analog-guest`' },
        owner: 'defect:unlabelled',
        unlabelled: ['analog-guest'],
      },
      {
        name: 'prose mentioning the sibling stays off the Repo: line',
        t: { labels: ['analog-operator'], repoLine: "`analog-operator`\n\nThe analog-guest half is TAC-428." },
        owner: 'analog-operator',
        unlabelled: [],
      },
    ];

    it.each(cases)('$name', ({ t, owner, unlabelled }) => {
      const doc = JSON.stringify(ticket(t));
      expect(evalOn(rules, `${doc} | owner`, t)).toBe(owner);
      expect(evalOn(rules, `${doc} | named_unlabelled`, t)).toEqual(unlabelled);
    });
  });

  describe('what the build selects and what it refuses', () => {
    // Mirrors build-ready.yml's SELECTED filter and the half-routed arm of
    // its DEFECTS filter. Both read the defs above.
    const selects = (t: Ticket, repo: string) =>
      evalOn(
        rules,
        `${JSON.stringify(ticket(t))} | (owner == $repo and (repo_labels|length) == 1 and (named_unlabelled|length) == 0)`,
        t,
        repo,
      );
    const halfRouted = (t: Ticket) =>
      evalOn(
        rules,
        `${JSON.stringify(ticket(t))} | ((repo_labels|length) == 1 and (named_unlabelled|length) > 0 and ((owner|startswith("defect:"))|not))`,
        t,
      );

    const ordinary: Ticket = { labels: ['analog-operator'], repoLine: '`analog-operator`' };
    const half: Ticket = { labels: ['analog-guest'], repoLine: '`analog-guest` and `analog-operator`' };
    const unlabelled: Ticket = { labels: ['analog-operator'], repoLine: '`analog-guest`' };

    it('builds an ordinary ticket', () => {
      expect(selects(ordinary, 'analog-operator')).toBe(true);
      expect(halfRouted(ordinary)).toBe(false);
    });

    it('refuses a half-routed ticket in the repo that owns it, and never builds it', () => {
      expect(selects(half, 'analog-guest')).toBe(false);
      expect(halfRouted(half)).toBe(true);
    });

    it('does not let the unlabelled repo build a half-routed ticket either', () => {
      expect(selects(half, 'analog-operator')).toBe(false);
    });

    // The half-routed message says "only <repo> would ever build it", which is
    // false of defect:unlabelled, where nothing builds it at all. Keeping the
    // two apart is what stops the wrong message being posted.
    it('does not treat a defect:unlabelled ticket as half-routed', () => {
      expect(halfRouted(unlabelled)).toBe(false);
    });
  });
});
