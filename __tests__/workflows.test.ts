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

import { commentMarker, isBotComment } from '@/scripts/lib/comment-provenance.mjs';

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
function runJq(program: string, args: string[]): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'tac439-jq-'));
  const file = join(dir, 'program.jq');
  try {
    writeFileSync(file, program, 'utf8');
    const out = execFileSync('jq', ['-n', '-c', ...args, '-f', file], { encoding: 'utf8' });
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function evalOn(rules: string, expr: string, _t: Ticket, repo = 'analog-operator'): unknown {
  return runJq(`${rules}\n${expr}`, ['--arg', 'repo', repo]);
}

/** build-ready.yml's `SELECTED` program: the jq that decides start and resume. */
function extractSelected(source: string): string {
  const m = /SELECTED=\$\(echo "\$RESPONSE" \| jq -c[\s\S]*?"\$RULES"'\n([\s\S]*?)\n\s*'\)/.exec(source);
  if (!m) throw new Error('no SELECTED program found');
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
}

/**
 * The capture step's two jq programs (TAC-441): SECRET_NAMES reads the
 * workflow file for the env entries that hold a secret, and SESSION redacts
 * the denied commands against their values.
 */
function extractSecretNames(source: string): string {
  const m = /SECRET_NAMES=\$\(git show [^\n]*\| jq -Rnc '\n([\s\S]*?)'\) \|\| SECRET_NAMES='\[\]'/.exec(source);
  if (!m) throw new Error('no SECRET_NAMES program found');
  return m[1];
}

function extractSession(source: string): string {
  const m = /SESSION=\$\(jq -c --argjson names "\$SECRET_NAMES" '\n([\s\S]*?)' "\$EXECUTION_FILE"\)/.exec(source);
  if (!m) throw new Error('no SESSION program found');
  return m[1];
}

/** The whole capture block, from its comment to the `fi` after the fallback. */
function extractCaptureBlock(source: string): string {
  const m = /( *# What the session did[\s\S]*?\n *SESSION='\{"ended"[^\n]*\n *fi\n)/.exec(source);
  if (!m) throw new Error('no capture block found');
  return m[1];
}

/** Runs `program` with jq over `input` written to a file, as the workflow does. */
function runJqOnFile(program: string, input: string, args: string[], env: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'tac441-jq-'));
  const programFile = join(dir, 'program.jq');
  const inputFile = join(dir, 'input');
  try {
    writeFileSync(programFile, program, 'utf8');
    writeFileSync(inputFile, input, 'utf8');
    return execFileSync('jq', [...args, '-f', programFile, inputFile], {
      encoding: 'utf8',
      // Not process.env: a real LINEAR_API_KEY in the shell running the
      // tests must not reach a case that expects it unset.
      env: { NODE_ENV: 'test' as const, PATH: process.env.PATH ?? '', ...env },
    });
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

  // TAC-451. Both prompts teach `node scripts/linear.mjs` for every Linear
  // write, in a block kept byte for byte with analog-guest
  // (scripts/lib/linear-prompts.test.ts). analog-guest's allowlists already
  // carried Bash(node:*); these carried no node at all, so this repo adds the
  // helper alone, and nothing in the shared prompt test would notice the
  // entry going missing. Without it every write is refused, and a refusal
  // fails silently. `allows` models Claude Code's documented Bash rule, not
  // its code, so it proves the entry is present, not that Claude Code admits
  // it. Only a real run can show that: audit run 35303513132 (TAC-451's
  // fixture, Claude Code 2.1.276) is the record of it admitting all four
  // helper calls under this entry.
  describe('the Linear helper each prompt teaches is on its allowlist', () => {
    type Step = { uses?: string; with?: { claude_args?: string; prompt?: string } };

    const claudeStep = (src: string) => {
      const doc = yaml.load(src) as { jobs: Record<string, { steps: Step[] }> };
      const step = Object.values(doc.jobs)
        .flatMap((job) => job.steps)
        .find((s) => s.uses?.startsWith('anthropics/claude-code-action'));
      if (!step?.with?.claude_args || !step.with.prompt) throw new Error('no claude-code-action step');
      return { args: step.with.claude_args, prompt: step.with.prompt };
    };

    const tools = (args: string, flag: string) => {
      const m = new RegExp(`${flag} "([^"]*)"`).exec(args);
      if (!m) throw new Error(`no ${flag}`);
      return m[1].split(',');
    };

    // Bash(x) allows exactly x; Bash(x:*) allows x followed by anything. Any
    // other `*` is a wildcard form this doesn't model, and treating it as an
    // exact match would let a deny rule such as Bash(node *) pass unseen.
    const allows = (rule: string, command: string) => {
      const m = /^Bash\((.*)\)$/.exec(rule);
      if (!m) return false;
      if (m[1].replace(/:\*$/, '').includes('*')) throw new Error(`unmodelled wildcard rule: ${rule}`);
      if (!m[1].endsWith(':*')) return command === m[1];
      const prefix = m[1].slice(0, -2);
      return command === prefix || command.startsWith(`${prefix} `);
    };

    it.each([
      ['build-ready.yml', BUILD],
      ['audit-new-todo.yml', AUDIT],
    ])('%s', (_name, path) => {
      const { args, prompt } = claudeStep(read(path));
      const taught = prompt
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('node scripts/linear.mjs '));
      // comment, describe, label add, label remove, state. Zero would pass
      // every assertion below and prove nothing.
      expect(taught).toHaveLength(5);
      const allowed = tools(args, '--allowedTools');
      const disallowed = tools(args, '--disallowedTools');
      for (const command of taught) {
        expect({ command, allowed: allowed.some((rule) => allows(rule, command)) }).toEqual({ command, allowed: true });
        expect({ command, disallowed: disallowed.some((rule) => allows(rule, command)) }).toEqual({ command, disallowed: false });
      }
    });
  });

  // TAC-441. [DENIALS] used to redact LINEAR_API_KEY alone. It now redacts
  // every secret the capture step holds, by value, with the names read from
  // the workflow file instead of a list someone has to remember to extend.
  // Every value here is fake.
  describe('[DENIALS] redacts every secret the capture step holds', () => {
    type Denial = { tool_name: string; tool_input: Record<string, string> };
    type Session = { ended: string; turns: number; denials: number; redacting: string[]; denied: string[] };

    const record = (denials: Denial[]) =>
      JSON.stringify([
        { type: 'system', subtype: 'init' },
        { type: 'result', subtype: 'success', num_turns: 7, permission_denials: denials },
      ]);
    const bash = (command: string): Denial => ({ tool_name: 'Bash', tool_input: { command } });

    const LINEAR = 'fake-linear-key-0001';
    const SERVICE = 'fake-service-key-0002';
    const WITHHELD = ['(withheld: this step found no secret to redact against)'];

    it('the capture block is identical in both workflows', () => {
      expect(extractCaptureBlock(auditSrc)).toBe(extractCaptureBlock(buildSrc));
    });

    describe.each([
      ['build-ready.yml', BUILD],
      ['audit-new-todo.yml', AUDIT],
    ])('%s', (_name, path) => {
      const session = extractSession(read(path));
      const capture = (names: string[], env: Record<string, string>, denials: Denial[]): Session =>
        JSON.parse(runJqOnFile(session, record(denials), ['-c', '--argjson', 'names', JSON.stringify(names)], env));

      it('replaces each secret and leaves the rest of the command as it was', () => {
        const out = capture(['LINEAR_API_KEY', 'SERVICE_ROLE_KEY'], { LINEAR_API_KEY: LINEAR, SERVICE_ROLE_KEY: SERVICE }, [
          bash(`curl -H 'Authorization: ${LINEAR}' 'https://example.test/rest/v1/guests?apikey=${SERVICE}' | jq .`),
          { tool_name: 'Read', tool_input: { file_path: `/home/runner/work/_temp/${SERVICE}.md` } },
        ]);
        expect(out.denied).toEqual([
          "Bash: curl -H 'Authorization: ***' 'https://example.test/rest/v1/guests?apikey=***' | jq .",
          'Read: /home/runner/work/_temp/***.md',
        ]);
        expect(out.redacting).toEqual(['LINEAR_API_KEY', 'SERVICE_ROLE_KEY']);
        expect({ ended: out.ended, turns: out.turns, denials: out.denials }).toEqual({ ended: 'success', turns: 7, denials: 2 });
      });

      // An empty value would reach split(""), which breaks the text apart
      // between every character.
      it('skips a secret that is empty, blank or unset', () => {
        const out = capture(
          ['BLANK_KEY', 'EMPTY_KEY', 'LINEAR_API_KEY', 'UNSET_KEY'],
          { BLANK_KEY: ' \n\t', EMPTY_KEY: '', LINEAR_API_KEY: LINEAR },
          [bash('git -C /home/runner/work/analog-operator/analog-operator branch --show-current')],
        );
        expect(out.denied).toEqual(['Bash: git -C /home/runner/work/analog-operator/analog-operator branch --show-current']);
        expect(out.redacting).toEqual(['LINEAR_API_KEY']);
      });

      it('matches a secret saved with a trailing newline as it was typed', () => {
        const out = capture(['SERVICE_ROLE_KEY'], { SERVICE_ROLE_KEY: `${SERVICE}\n` }, [bash(`curl -d token=${SERVICE} https://example.test`)]);
        expect(out.denied).toEqual(['Bash: curl -d token=*** https://example.test']);
      });

      it('redacts a multi-line secret before whitespace is collapsed', () => {
        const pem = '-----BEGIN FAKE KEY-----\nAAAAfake\nBBBBfake\n-----END FAKE KEY-----';
        const out = capture(['SIGNING_KEY'], { SIGNING_KEY: pem }, [bash(`printf '%s' '${pem}'\n| wc -c`)]);
        expect(out.denied).toEqual(["Bash: printf '%s' '***' | wc -c"]);
      });

      // A tool call with no command and no file path, an MCP call say, is
      // printed as JSON, where a newline in the secret is the two characters
      // \n and the raw value no longer matches.
      it('redacts a secret inside a tool input printed as JSON', () => {
        const pem = '-----BEGIN FAKE KEY-----\nAAAAfake\n-----END FAKE KEY-----';
        const out = capture(['SIGNING_KEY'], { SIGNING_KEY: pem }, [
          { tool_name: 'mcp__fake__post', tool_input: { body: `sign ${pem} "quoted"` } },
        ]);
        expect(out.denied).toEqual(['mcp__fake__post: {"body":"sign *** \\"quoted\\""}']);
      });

      // Named so that name order would take the inner one first, cut it out
      // of the outer one, and leave the rest of the outer one showing.
      it('redacts a secret that contains another as a whole', () => {
        const inner = 'fake-inner-0004';
        const outer = `fake-outer-${inner}-end`;
        const out = capture(['INNER_KEY', 'OUTER_KEY'], { INNER_KEY: inner, OUTER_KEY: outer }, [bash(`a ${outer} b ${inner} c`)]);
        expect(out.denied).toEqual(['Bash: a *** b *** c']);
      });

      // "Bash: " is 6 characters, so the key starts at 1991 and runs across
      // the cut. Cut first and its first 9 characters would survive.
      it('redacts before the 2000-character cut', () => {
        const pad = 'x'.repeat(1985);
        const out = capture(['LINEAR_API_KEY'], { LINEAR_API_KEY: LINEAR }, [bash(`${pad}${LINEAR} tail`)]);
        expect(out.denied).toEqual([`Bash: ${pad}*** tail`]);
      });

      it('withholds the commands when it holds no secret to redact against, and still counts them', () => {
        const denials = [bash(`curl -H 'Authorization: ${LINEAR}' https://api.linear.app/graphql`)];
        // No names: the workflow file could not be read.
        const unread = capture([], { LINEAR_API_KEY: LINEAR }, denials);
        expect({ denied: unread.denied, denials: unread.denials }).toEqual({ denied: WITHHELD, denials: 1 });
        // Names, but none of them set in this step.
        expect(capture(['LINEAR_API_KEY'], {}, denials).denied).toEqual(WITHHELD);
        // Nothing denied, nothing to withhold.
        expect(capture([], {}, []).denied).toEqual([]);
      });
    });

    describe('the names come from the workflow file', () => {
      type Env = Record<string, unknown> | undefined;
      type Doc = { env?: Env; jobs: Record<string, { env?: Env; steps: Array<{ env?: Env; run?: string }> }> };

      // Deliberately broader than the workflow's pattern, so a form it misses,
      // such as secrets['X'], fails here instead of going unredacted.
      const SECRET_EXPR = /\bsecrets\b|\bgithub\.token\b/;
      const derive = (source: string, text: string): string[] =>
        JSON.parse(runJqOnFile(extractSecretNames(source), text, ['-Rnc']));

      /** The secret-bearing env the capture step holds, by a YAML parse: workflow, job and its own. */
      const heldSecrets = (source: string): Array<[string, string]> => {
        const doc = yaml.load(source) as Doc;
        const [job] = Object.values(doc.jobs);
        const step = job.steps.find((s) => s.run?.includes('SESSION=$(jq'));
        if (!step) throw new Error('no capture step');
        return [doc.env, job.env, step.env]
          .flatMap((env) => Object.entries(env ?? {}))
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && SECRET_EXPR.test(entry[1]));
      };

      it.each([
        ['build-ready.yml', BUILD],
        ['audit-new-todo.yml', AUDIT],
      ])('%s: every secret its capture step holds is found, each as a whole value', (_name, path) => {
        const source = read(path);
        const held = heldSecrets(source);
        expect(held.map(([name]) => name)).toContain('LINEAR_API_KEY');
        const derived = derive(source, source);
        for (const [name, value] of held) {
          expect({ name, derived: derived.includes(name) }).toEqual({ name, derived: true });
          // "Bearer ${{ secrets.X }}" can't be redacted on its own: the
          // variable's value is not the secret's.
          expect({ name, value, whole: /^\$\{\{[^}]*\}\}$/.test(value) }).toEqual({ name, value, whole: true });
        }
      });

      it('picks up a secret added later, at any level and in either quoting', () => {
        const workflow = [
          'env:',
          '  WORKFLOW_KEY: ${{ secrets.WORKFLOW_KEY }}',
          'jobs:',
          '  report:',
          '    env:',
          '      JOB_KEY: "${{ secrets.JOB_KEY }}"',
          '    steps:',
          '      - name: Report',
          '        env:',
          '          ADDED_LATER: ${{ secrets.SOME_NEW_SECRET }}',
          "          SINGLE_QUOTED: '${{ secrets.QUOTED }}'",
          '          GH_TOKEN: ${{ github.token }}',
          '          RUN_URL: ${{ github.server_url }}/${{ github.repository }}',
          '          TICKETS: ${{ steps.queue.outputs.tickets }}',
          '          LIMIT: "2"',
          '        run: echo',
          '',
        ].join('\n');
        expect(derive(buildSrc, workflow)).toEqual(['ADDED_LATER', 'GH_TOKEN', 'JOB_KEY', 'SINGLE_QUOTED', 'WORKFLOW_KEY']);
      });
    });
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

  // TAC-437's gate, checked where this repo decides it. Nothing here imports
  // scripts/lib/comment-provenance.mjs at runtime: CI resumes a blocked
  // ticket through build-ready.yml's own SELECTED jq, so the module's tests
  // alone would say nothing about whether a run resumes. Each case runs that
  // jq over a blocked ticket whose last turn is the comment named, then
  // checks the shared classifier reads the comment the same way.
  describe('which newest comment resumes a blocked ticket', () => {
    const selected = extractSelected(buildSrc);
    const PLAN = '**[FROM CLAUDE CODE]**\n\n[PLAN] TAC-TEST\n\nWaiting for approval.';
    const AUDIT = '**[FROM CLAUDE CODE]**\n\n[AUDIT] TAC-TEST\n\nA run might later post [NEEDS-INPUT], but none was raised.';
    const AUDIT_ESCAPED = '**\\[FROM CLAUDE CODE\\]**\n\n\\[AUDIT\\] TAC-TEST\n\nNo questions.';
    const RULING = '**[FROM CLAUDE CHAT — RULING]**\n\nPlan approved as written. Build it.';
    const CHAT_PLAIN = '**[FROM CLAUDE CHAT]**\n\nSplit 2026-09-17. The other half moves to its own ticket.';
    const UNPREFIXED = 'Approved, build it.';
    const DENIALS = '**[FROM CLAUDE CODE]**\n\n[DENIALS] TAC-TEST run=1 count=1\n\nBookkeeping.';

    /** True when build-ready.yml would resume the ticket. */
    const resumes = (bodies: string[]): boolean => {
      const issue = {
        id: 'issue-1',
        identifier: 'TAC-TEST',
        priority: 2,
        state: { name: 'Ready' },
        labels: { nodes: [{ name: 'analog-operator' }, { name: 'Needs Decision' }] },
        description: '**Repo:** `analog-operator`\n\nbody\n',
        comments: {
          nodes: bodies.map((body, i) => ({
            id: `c${i}`,
            createdAt: `2026-09-17T1${i}:00:00.000Z`,
            body,
          })),
        },
      };
      const response = { data: { issues: { nodes: [issue] } } };
      const out = runJq(`${rules}\n${JSON.stringify(response)} | ${selected}`, [
        '--arg', 'repo', 'analog-operator',
        '--argjson', 'limit', '2',
        '--argjson', 'maxAttempts', '2',
        '--argjson', 'liveHours', '3',
        '--arg', 'now', '2026-09-18T00:00:00Z',
      ]) as Array<{ mode: string }>;
      return out.some((t) => t.mode === 'resume');
    };

    // The jq gate is coarse: anything without the CC prefix resumes, a plain
    // CHAT note included. TAC-396's approval left it that way, leaving the
    // RULING-versus-context call to /work-ticket once it runs, which makes it
    // in Phase 0 step 2b and "Reply classification" (TAC-454).
    const cases: Array<{ name: string; bodies: string[]; resume: boolean }> = [
      { name: "Claude Code's own [AUDIT] does not resume it", bodies: [PLAN, AUDIT], resume: false },
      { name: 'a CHAT — RULING comment resumes it', bodies: [PLAN, RULING], resume: true },
      { name: 'a plain CHAT comment resumes it too', bodies: [PLAN, CHAT_PLAIN], resume: true },
      { name: 'an unprefixed reply resumes it', bodies: [PLAN, UNPREFIXED], resume: true },
      { name: 'a RULING followed by bookkeeping still resumes it', bodies: [PLAN, RULING, DENIALS], resume: true },
    ];

    it.each(cases)('$name', ({ bodies, resume }) => {
      expect(resumes(bodies)).toBe(resume);
      // The jq's own bookkeeping skip, marker_is("RESUME-CLAIM|SLACK|DENIALS").
      const lastTurn =
        bodies.filter((b) => !['RESUME-CLAIM', 'SLACK', 'DENIALS'].includes(commentMarker(b) ?? '')).at(-1) ?? '';
      expect(isBotComment(lastTurn)).toBe(!resume);
    });

    // Asserts today's wrong behaviour on purpose, under a name that says so.
    // The classifier reads an escaped CC prefix as CC's own (pinned in
    // scripts/lib/comment-provenance.test.ts); build-ready.yml's is_bot does
    // not unescape, so the jq reads it as human and resumes. TAC-396 kept that
    // jq unchanged (approved 2026-09-17), and the RULES block is shared
    // verbatim with analog-guest, so a fix lands in both repos or neither.
    // When it lands this goes red: flip the expectation and the name then.
    it('KNOWN GAP: an escaped CC [AUDIT] still resumes it, because is_bot does not unescape', () => {
      expect(isBotComment(AUDIT_ESCAPED)).toBe(true);
      expect(resumes([PLAN, AUDIT_ESCAPED])).toBe(true);
    });
  });
});
