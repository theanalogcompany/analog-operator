---
name: work-ticket
description: Run the autonomous ticket workflow on a Linear ticket. Plan-first, build only on explicit approval.
---

You are working on Linear ticket $ARGUMENTS for analog-operator. Each invocation is idempotent: it reads the ticket's state from Linear (and git), determines what to do, runs that work, and either exits cleanly or schedules the next invocation via `ScheduleWakeup` where a harness is available. Never instruct the operator to type `/loop`.

# State detection (run first on every invocation)

1. **Re-read ticket state.** `Linear:get_issue` for body + status, `Linear:list_comments` for the full comment thread (createdAt order). In CI there is no Linear MCP — use the GraphQL API with curl and `$LINEAR_API_KEY`, in exactly the two forms the workflow prompt gives. CI Bash denies expanding an environment variable (so `$LINEAR_API_KEY` is denied: pass the key with curl's `--variable`), command substitution, variable assignment, output redirection and heredocs, and a denied command fails silently.

2. **Compute.** Marker-detection convention: "contains `[MARKER]`" means the comment's marker is `[MARKER]`, and a comment's marker is the first `[...]` marker after its `**[FROM CLAUDE CODE]**` prefix (the prefix, a blank line, then the marker). It is NOT a substring match anywhere in the body: an `[AUDIT]` or a `[PLAN]` that quotes `[NEEDS-INPUT]` keeps its own meaning. The same holds for every marker: `[POLLING-STATE]`, `[POLLING-ACK]`, `[POLLING-TIMEOUT]`, `[POLLING-CLOSED]`, `[NEEDS-INPUT]`, `[NEEDS-ACTION]`, `[PLAN]`, `[HUMAN-REVIEW-REQUIRED]`, `[AUDIT]`, `[AUDIT-SKIPPED]`, `[BUILD-SKIPPED]`, `[FINDING]`, `[RESUME-CLAIM]`, `[SLACK]`, `[DENIALS]`, `[SILENT-RUN]`.

   **Provenance comes from the prefix, never from the author ID.** Every comment on every ticket is under Jaipal's account, your own included.

   - `botComments` — comments whose body contains `**[FROM CLAUDE CODE]**`
   - `bookkeeping` — bot comments whose marker is `[SLACK]` (written by the Slack sync), `[RESUME-CLAIM]` (written by the build workflow before it resumes a ticket) or `[DENIALS]` (written by the build or audit workflow after a session that hit permission denials). They record what a workflow did; they are not a turn. **Every definition below skips them.** Without that, a claim posted a moment before this session started would look like the newest word on the ticket and bury Jaipal's reply.
   - `humanComments` — every other comment. A comment with no recognised prefix is human input.
   - `lastBotComment` — most recent of `botComments`, skipping bookkeeping (null if none). **Used for terminal-state detection only.**
   - `newestComment` — most recent comment of any kind, skipping bookkeeping. "The newest comment" anywhere in this file means this one.
   - `lastQuestionComment` — most recent bot comment that asks Jaipal something and waits for his reply (null if none): its marker is `[NEEDS-INPUT]`, `[PLAN]`, `[HUMAN-REVIEW-REQUIRED]` or `[NEEDS-ACTION]`, or it is an `[AUDIT]` whose QUESTIONS section asks at least one numbered question ("Decided without asking" lines are not questions). Nothing else counts. A clean `[AUDIT]`, `[AUDIT-SKIPPED]`, `[BUILD-SKIPPED]`, `[FINDING]`, the polling markers and PR-link comments ask nothing, so a cleanly audited ticket is a fresh run, never a question awaiting a reply. **Used for routing decisions and as the `newReplies` baseline.**
   - `newReplies` — human comments created after `(lastQuestionComment?.createdAt ?? '0')`
   - `pollingState` — most recent bot comment containing `[POLLING-STATE]`
   - `branchExists` — `git branch --list jaipal/TAC-XXX-*` non-empty

3. **Stale-session check.** Capture `invocationStartedAt` BEFORE the comment read. If `pollingState` exists AND `pollingState.updatedAt > invocationStartedAt`, another chain is active for this ticket — exit immediately, no further action, no new ScheduleWakeup.

4. **Branch table.** Terminal-state checks read `lastBotComment`. All other rows read `lastQuestionComment`.

| Condition | Action |
|---|---|
| `lastBotComment` contains `[HUMAN-REVIEW-REQUIRED]` and no human reply postdates it | Exit. No wakeup. |
| `lastBotComment` contains `[NEEDS-ACTION]` and no human reply postdates it | Exit. Blocked on Jaipal executing something. |
| `lastBotComment` contains `[POLLING-TIMEOUT]` and no human reply postdates it | Exit. No wakeup. |
| `lastBotComment` contains `[POLLING-CLOSED]` | Exit. No wakeup. Operator-driven wind-down. |
| `lastBotComment` contains a PR link (Phase 5 marker) | Exit. No wakeup. Manual merge gate. |
| `lastQuestionComment === null` | Fresh run. Phase 0 → Phase 2. A cleanly audited ticket starts here, whatever other bot comments it carries. |
| `lastQuestionComment` exists, `newReplies.length === 0`, harness available, `pollingState.iteration < 26` | Run Phase 0. Increment iteration, update `[POLLING-STATE]`, ScheduleWakeup per backoff, exit. |
| `lastQuestionComment` exists, `newReplies.length === 0`, no harness | Exit. The ticket carries its `Blocked On` label; the next scheduled run after Jaipal replies resumes it. |
| `lastQuestionComment` exists, `newReplies.length === 0`, `pollingState.iteration >= 26` | Post `[POLLING-TIMEOUT]`. Exit. Leave the `Blocked On` label on. |
| `lastQuestionComment` exists, `newReplies.length > 0` | Run Phase 0. Classify the most recent reply (see "Reply classification"). Route accordingly. |

**No silent exit after Jaipal speaks.** If the ticket carries a `Blocked On` label (`Needs Decision` or `Needs Action`) and `newestComment` is human input, the session posts a comment before it exits, whichever exit it takes: a row above, a Phase 0 gate, an answer it could not match, a holding pattern, a high-stakes stop. The comment says what the session did with his input and what is still needed. An answer that cannot be matched to a question gets `[NEEDS-INPUT]` saying so (Phase 0 step 2c); it never gets a quiet exit, because a quiet exit leaves the ticket looking exactly like one still waiting for him. The only silent exit is when the newest comment is already a bot comment: the ticket already says why it is waiting, and saying it again on every poll is noise.

# Reply classification (3-way)

Take the most recent human reply and classify it:

1. **Proceed** — approves the plan or answers the question with a clear go signal ("build", "approved, proceed", or a direct answer that unblocks). Route per "Phase resumption".
2. **Modify** — carries revisions or new constraints ("looks good but change X"). Integrate, re-post the plan prefixed `[PLAN]`, leave `Needs Decision` on, exit.
3. **Wind-down** — says stop without proceeding ("this works, close it", "no further scope"). Post `[POLLING-CLOSED]`, exit. Status untouched; Jaipal closes manually.

Chit-chat or holding-pattern ("let me think", "be back in an hour") is NOT substantive — post `[POLLING-ACK]`, leave the ticket where it is, exit.

When intent is ambiguous between Proceed/Modify and Wind-down, default to Proceed/Modify. A false wind-down terminates the chain; a false negative is recoverable.

# Phase resumption

When the classification is **Proceed**, route by `lastQuestionComment`. Phase 0 step 2 has already applied the reply to `## Open questions`, and a ticket with a question still open never gets this far.

- **`[AUDIT]`** → the audit's questions are answered. Run Phase 1 → Phase 2 as on a fresh run, integrating the rulings.
- **`[PLAN]`** → approval received. Remove `Needs Decision`. Advance to Phase 3.
- **`[NEEDS-INPUT]` AND `branchExists === false`** → Phase 2 question answered. Re-run Phase 1 audit integrating the answer, and re-post the plan per Phase 2.
- **`[NEEDS-INPUT]` AND `branchExists === true`** → Phase 3 question answered. Read `git status` and `git diff` on the branch to establish what is done and what is left, then continue.
- **`[NEEDS-ACTION]`** → Jaipal says it ran. Verify it against the live system as step 17 requires, remove `Needs Action`, and continue where the build stopped.
- **`[HUMAN-REVIEW-REQUIRED]` carrying a plan** → handled by Phase 0 step 4, which runs first; this row exists so the routing is not silent about it. **Never advance to Phase 3.** An `[HUMAN-REVIEW-REQUIRED]` that carries no plan is a different thing — step 13's diverged-`main` stop and a mid-build high-stakes uncertainty both use the marker — and a reply to one of those resumes the build where it stopped, exactly like `[NEEDS-INPUT]` with `branchExists === true`.

Leave the status alone throughout. `Needs Decision` comes off in Phase 0 when no question is left open, or on the `[PLAN]` route when the plan is approved.

# Phase 0 — Verify scope (runs every invocation)
1. Re-read the ticket body and status — surfaces mid-flow edits.
2. **Gate, with Jaipal's answers applied before the open-questions check.** The order in (b) and (c) matters: checking `## Open questions` before applying his answer finds his own question still there, exits, and ignores the answer until he edits the ticket by hand.

   **a. Status and repo.**
   - The ticket must be in **Ready** or **In Progress**. A ticket in **Todo** has not been audited yet — say so and exit; the audit automation reaches it on its next scheduled run, which can be hours away.
   - It must be this repo's, by "Which repo works a ticket" in `.claude/process.md`. If it is another repo's, say which repo to run in and exit.
   - It must carry exactly one repo label, and its `Repo:` line must name no repo beyond the one it is labelled for: cross-repo work is two tickets, one per repo, linked. A ticket with two repo labels, a `Repo:` line naming no labelled repo, or a `Repo:` line naming a repo the ticket is **not** labelled for, is not buildable. The last case is the one that used to pass: a repo can be picked, so the build started, and the unlabelled half was never built by anyone. Post `[BUILD-SKIPPED]` in the form `.claude/process.md` gives and add `Needs Decision`, unless the ticket already carries both. Then exit.

   **b. Apply new answers.** An open question is a numbered item with text under `## Open questions`; the template's empty `1.`, HTML comments, and italic notes such as *None* or *Ruled …* are not. If `newReplies` is non-empty and the block holds open questions, apply the replies before (c) reads the block, by the rules under "When Jaipal answers" in `.claude/process.md`:
   - A reply answers a question when it gives the decision that question asks for: its number with an option or a stated choice ("1 A", "2: the most recent"), or, when only one question is open, an option or a choice alone.
   - For each answered question, delete the item and add one italic line at the end of the block: `*Ruled YYYY-MM-DD, question N: <the decision>.*` The remaining items keep their numbers.
   - A reply that could answer more than one question, or states no decision, answers nothing. Leave those questions open. Never guess a match to get past this step; (c) says what must be posted instead.
   - When no open question is left, remove `Needs Decision`. Do not change the status. Carrying a ruling into the plan or the spec belongs to the phase the routing sends you to, not to this step.

   **c. Open questions.** If `## Open questions` still holds an open question, the ticket is not buildable whatever its status. Add `Needs Decision` if it is not already on. Then, if the newest comment is human input or you just added the label, post exactly one comment before exiting. This is required, not optional:
   - The newest reply is a holding pattern ("let me think", see "Reply classification"): post `[POLLING-ACK]`.
   - Otherwise: post `[NEEDS-INPUT]` listing every question still open, each in the format under "Asking Jaipal a question" in `.claude/process.md`. For each, say what the new replies said about it and why that did not settle it, or that no reply addressed it. When his answer could not be matched, this comment is how he finds out. `[NEEDS-INPUT]` is a marker the Slack sync posts, so it reaches the thread he answered in.

   If the newest comment is already a bot comment and you did not just add the label, the ticket already says why it is waiting: post nothing.

   A ticket that fails the gate gets no plan and no branch. Exit, after the polling bookkeeping of the branch-table row that sent you here, if that row has any.
3. Re-read the relevant sections of CLAUDE.md — Workflow rules, Code conventions, Common gotchas. Cite which sections you consulted on the FIRST invocation.
4. Check the "Notes for Claude Code" block against the high-stakes list in CLAUDE.md ("High-stakes flags"). **Do not stop here.** Note that the ticket is high-stakes and carry that into Phase 2: the plan is written in full, posted as `[HUMAN-REVIEW-REQUIRED]` instead of `[PLAN]`, `Needs Decision` goes on, and the run never advances to Phase 3 on any reply. If an `[HUMAN-REVIEW-REQUIRED]` plan is already on the ticket and Jaipal has replied to it, post one line saying the plan stands and the build needs a session he drives, then exit — do not re-post the plan. **That line carries the `[HUMAN-REVIEW-REQUIRED]` marker and re-adds `Needs Decision` if step 2b removed it.** Both matter: the marker makes the branch table treat the ticket as terminal, and the label keeps it out of the next run's selection. Without them the ticket is Ready and unblocked with a bot comment last, so every scheduled run re-audits it and posts the same line again.

# Phase 1 — Audit (read-only) — fresh start, answered `[AUDIT]` questions, or post-`[NEEDS-INPUT]` Phase 2 resumption
5. Use the Explore subagent to map the affected surface area. Read at least one existing file the new code will sit next to. Read migrations touching relevant tables. Read existing tests for modules being modified.
6. Identify existing utilities to reuse. Check `lib/`, `components/`, `hooks/`. Grep for any new function name you would add to confirm it does not already exist.
7. **Cross-repo audit.** If the ticket has a `## Contract` section, OR references a sibling ticket in `analog-guest`, fetch and read the sibling ticket AND the Contract before writing the plan. The plan MUST cite the Contract verbatim where it touches contract surface — endpoint path, request shape, response shape, env var names and formats. A needed deviation is a Phase 2 open question, not a Phase 3 silent fix. See CLAUDE.md "Cross-repo contracts".

# Phase 2 — Plan
8. Output a written plan: scope, file paths, function decomposition, sequence, patterns reused, edge cases, what you chose NOT to do, open questions. A plan that changes copy a guest can read quotes the new wording verbatim, in full, and asks for approval of that wording specifically — approval of the plan is not approval of the words.
9. If the Testing section is blank or partial, propose automated coverage. Match the qa-runner subagent's categorization rules.
10. If `## Gate` names no QA route, propose one — `QA: Script` if provable by a test or query, `QA: Device` if it needs Jaipal on a real device or at the venue. Operator tickets skew device-heavy; say so plainly rather than proposing a script route that cannot exist.
11. If the plan has open questions:
    - Post `[NEEDS-INPUT]` with questions numbered, each written in the format under "Asking Jaipal a question" in `.claude/process.md`. State the options; do not recommend one.
    - Add the same numbered questions to the ticket body's `## Open questions` block.
    - Add `Needs Decision`. Leave the status alone.
    - Where a harness exists, write `[POLLING-STATE]` (iteration=1) and ScheduleWakeup(60s). In CI, exit.
12. If the plan is clear:
    - Post it prefixed `[PLAN]` — or `[HUMAN-REVIEW-REQUIRED]` if step 4 flagged the ticket as high-stakes, which changes the marker and nothing else on this step.
    - Add `Needs Decision` and leave the status alone. A plan awaiting approval is a decision Jaipal owes, and it belongs where he looks.
    - Where a harness exists, write `[POLLING-STATE]` (iteration=1) and ScheduleWakeup(60s) so a fast reply is caught. In CI, exit; the poll resumes it.

Advance to Phase 3 only on a substantive approval reply. A reply with revisions counts as substantive — integrate, re-post, keep `Needs Decision` on.

# Standing rulings

Pre-authorized. Decide and proceed, naming the ruling in your comment so a pre-authorized decision is distinguishable from a silent one.

- **SR-1 Contrast and accessibility figures.** WCAG arithmetic, not taste.
- **SR-2 Copy that is factually wrong about system behaviour.** Correct it. Does not extend to copy in the agent's voice.
- **SR-3 Test quality.** Mutation verification, real gate vs mock, assertion targets.

Everything else is Jaipal's: anything in the agent's voice a guest can read, anything that changes what auto-sends or when, anything where the answer is taste. SR-2 does not cover operator-app copy describing what a send will do — that is one edit from the guest-facing surface and stays with Jaipal.

# Phase 3 — Build (only after explicit substantive approval)
13. **Sync local `main` before branching.** Skip if the branch exists. Otherwise `git checkout main && git fetch origin && git pull origin main --ff-only`. If `--ff-only` fails — local `main` diverged — STOP. Post `[HUMAN-REVIEW-REQUIRED]` with `git log --oneline HEAD..origin/main` and `git log --oneline origin/main..HEAD`, add `Needs Decision` and leave the status alone, exit. Do NOT auto-rebase or reset. (Branching from stale local `main` produced the TAC-37 conflict storm.)
14. Create the branch if absent: `jaipal/TAC-XXX-short-description`.
15. Implement the plan. Match existing patterns. `@/*` alias for imports. Errors as values: `{ ok: true, data }` or `{ ok: false, error }`. Throw only at outer boundaries. Zod at boundaries. No `any`. No new top-level directories without asking.
16. If a question surfaces mid-build, post `[NEEDS-INPUT]`, add it to `## Open questions`, add `Needs Decision` and leave the status alone, exit. Don't guess. If it blocks only one item of a multi-item ticket, ship the unblocked items and split the blocked item into its own ticket, created in **Todo** with one repo label, a Repo: line naming that repo, and the question under its `## Open questions`. Without the label and the line, the audit cannot place it. The audit moves it to Ready with `Needs Decision`; only the audit sets Ready.
17. **If something requires Jaipal to execute it** — a production migration, an env var, an Expo or APNs console change, a build or submit step, anything on a physical device — post `[NEEDS-ACTION]`, add `Needs Action` and leave the status alone, exit. The comment must contain, and nothing may substitute for:
    1. The exact command or SQL in a code block, runnable as-is. No placeholders.
    2. Where it runs — which database, environment, shell, device.
    3. The rollback in its own code block, runnable as-is. If you cannot write one, say so explicitly rather than omitting it.
    4. One line: what should be true afterward, checkable in one query or one glance.

    When Jaipal confirms it ran, verify against the live system — live schema inspection, a real API response, the actual build manifest — not against the migration file and not against his confirmation.
18. **If you find a defect outside this ticket's scope**, post `[FINDING]`. Do not file a ticket, do not fix it, do not widen scope. Maximum three per ticket; list any remainder as one-liners under "not detailed".
19. **CLAUDE.md hygiene check.** Before exiting Build, evaluate whether this change introduces anything belonging in CLAUDE.md per "Keeping this file current": new `package.json` scripts, new migrations (with log entry), new library patterns, gotchas found during implementation, new directories, new env vars, new workflow rules, version bumps to documented dependencies. If yes, update CLAUDE.md in the same commit. If no, note in the PR description: *"CLAUDE.md update considered: [what you checked, why no update needed]."* Without that line by Phase 5, the task is incomplete.

# Phase 4 — Verify
20. `npx tsc --noEmit` — must pass.
21. `npm run lint` — must pass.
22. Test gate (conditional on `package.json`):
    - No `package.json`, or no `"test"` script: emit `tests: not yet configured — jest-expo wired during TAC-112 Phase 1 scaffold` and continue. Non-blocker.
    - Has a `"test"` script: run `npm test`. All must pass. Report count delta vs main. Any failure blocks.
23. If the diff touches any screen under `app/**` or any component under `components/**`, invoke the `qa-runner` subagent.
24. Invoke `code-reviewer` on the diff. Address BLOCKER and MAJOR; explain skips on MINOR.

# Phase 5 — Ship

**One rule, CI and local alike** (ruled 2026-09-17): audit → `[PLAN]` → Jaipal's reply → build → commit → push → draft PR → stop. The run **never merges** and **never pushes to `main`**.

Those two are not equally enforced, and the difference matters. Branch protection on `main` blocks the push: the ruleset carries `non_fast_forward`, `deletion` and a required PR with the `check` status, and no bypass actors. **It does not block the merge** — `required_approving_review_count` is `0`, so a PR whose check is green is mergeable by anyone who can call the API. Not merging is therefore a rule this run keeps, not one the server keeps for it. The allowlist is the backstop: `gh pr merge` and `gh pr ready` are not in it. A per-ticket "Do not self-commit" line in a Notes block overrides this for that ticket only.

25. Commit. Subject: `TAC-XXX: <imperative lowercase subject>`. Body explains why if non-obvious.
26. Push the branch, then `gh pr create --draft`. Title matches the commit subject, so it carries the ticket ID. Body: changes + test count delta + plan deviations + the CLAUDE.md note + anything you would push back on. Draft is deliberate — the PR is how the work reaches Jaipal, not a request for review by a bot.
27. Post a Linear comment with the PR link. Apply the QA route label (`QA: Script` or `QA: Device`) if not already set. **Do not set the status by hand** — opening the PR moves the ticket to In Progress automatically, and merging moves it to Ready For QA automatically.
28. Exit without adding a `Blocked On` label. The open PR is the signal that the merge is Jaipal's to run; a label would make `Blocked On` mean two kinds of waiting. He runs `gh pr merge --squash --delete-branch` after reviewing the PR on GitHub, and the merge automation moves the ticket to Ready For QA.

**Cross-repo UAT gate.** If Phase 1 flagged a sibling ticket, the PR description MUST call out: *"Cross-repo UAT REQUIRED before Done — unit tests passing on both sides does not prove the contract is consistent."* The ticket stays in Ready For QA until Jaipal runs UAT against the deployed sibling client. The 2026-05-27 TAC-207 incident (both sides green, integration broken 9 hours after deploy) is the documented case.

# Polling protocol

Where a harness is available, ScheduleWakeup the next invocation after posting a comment that requires a human response. Exceptions that exit immediately: `[HUMAN-REVIEW-REQUIRED]`, `[NEEDS-ACTION]`, `[POLLING-CLOSED]`, `[POLLING-TIMEOUT]`, and PR-link comments.

**In CI there is no harness.** Do not attempt ScheduleWakeup. Add the right `Blocked On` label, leave the status alone, and exit; the next scheduled run is the resume mechanism, and GitHub runs it hours apart (TAC-429).

`[NEEDS-ACTION]` never polls even with a harness. The blocking step is Jaipal at a laptop or holding a device, not answering from his phone.

## Backoff

Intervals (seconds): 60, 120, 240, 300, 300, ... cap at 300. `TIMEOUT_LIMIT = 26` iterations, ≈ 2 hours. At the limit, post `[POLLING-TIMEOUT]` and exit, leaving the `Blocked On` label on.

## `[POLLING-STATE]` comment (single, edited in place)

One per session. Capture its id from the create response; later updates edit that comment.

```
**[FROM CLAUDE CODE]**

[POLLING-STATE] iteration=N nextWakeupAt=<ISO timestamp> sessionStartedAt=<ISO timestamp>
```

Reset iteration to 1 whenever any reply lands. Its `updatedAt` is also the staleness signal.

## `[POLLING-ACK]` comment

```
**[FROM CLAUDE CODE]**

[POLLING-ACK] Got it — still polling for your answer.
```

Then update `[POLLING-STATE]` (iteration 1) and ScheduleWakeup(60s).

## `[POLLING-TIMEOUT]` comment

```
**[FROM CLAUDE CODE]**

[POLLING-TIMEOUT] Exhausted automated polling after 2 hours. Reply when ready — the poll will pick this back up.
```

## `[POLLING-CLOSED]` comment

```
**[FROM CLAUDE CODE]**

[POLLING-CLOSED] Acknowledged — exiting per operator's wind-down reply.
```

Status untouched. The agent never sets a ticket to Done; the permission hook denies it.

# Hard rules (non-negotiable)
- Plan gate (Phase 2 → 3) requires explicit substantive approval. Do not advance on silence or on chit-chat. The substantive-answer judgment IS the gate.
- **Provenance is the prefix, never the author ID.** Every comment shares one author. A comment with no `**[FROM CLAUDE CODE]**` prefix is human input.
- **Post every comment flat.** Never set `parentId`. Jaipal reads a ticket top to bottom, and a threaded reply hides inside an earlier comment.
- ScheduleWakeup is the only polling primitive where a harness exists — no `Bash sleep`, no until-loops. In CI, don't poll at all.
- No auto-merge. The merge gate stays manual.
- **Build only from Ready or In Progress, and only a ticket with one repo label.** Todo means committed but not yet audited. Two repo labels means the ticket needs splitting: cross-repo work is two tickets, one per repo, linked.
- **Apply Jaipal's answers before checking for open questions.** Phase 0 step 2b runs before 2c, every time.
- **Never exit silently on a ticket carrying a `Blocked On` label when the newest comment, skipping `[SLACK]`, `[RESUME-CLAIM]` and `[DENIALS]` bookkeeping, is human input.** Post a comment saying what happened to his input first. An answer you cannot match gets `[NEEDS-INPUT]` saying so, never a quiet exit.
- **Never promote a ticket to Ready.** Only the audit puts a ticket there, whatever it finds. Never move an existing ticket to Todo; the only way into Todo is a new ticket, such as a split-off blocked item.
- **Anything that needs Jaipal gets the right `Blocked On` label immediately**, and the status stays where it is. Never wait silently on a ticket that still looks available. A plan awaiting approval counts. A PR awaiting merge does not.
- **Never run a production migration.** Write the SQL and hand it over via `[NEEDS-ACTION]`.
- No loyalty-program language anywhere — points, rewards, tier, earn, badges, progress bars are forbidden. Guests are recognized, not enrolled.
- Uncertainty about whether a high-stakes change is *safe* → `[HUMAN-REVIEW-REQUIRED]`, never `[NEEDS-INPUT]`. An ordinary open question on a high-stakes ticket is still a question and still `[NEEDS-INPUT]` — the ticket's plan is what carries `[HUMAN-REVIEW-REQUIRED]`, not every comment on it. (Both are now reachable: before TAC-439 a high-stakes ticket never got as far as Phase 2.)
- **A high-stakes ticket is planned but never built by an automated run.** No approval, however explicit, moves it to Phase 3. The plan is the deliverable; the build is Jaipal's own session.
- **An automated run may modify `.github/workflows/*` and `.claude/*` on a branch.** It commits and pushes them like any other change and opens a draft PR; Jaipal reviews at merge. It never merges and never pushes to `main`.
- Wind-down is operator-driven. The agent never decides to wind down on its own.
- The agent never marks a ticket Done. In Progress (on PR open) and Ready For QA (on merge) are set by Linear's PR automations, not by you.
- CLAUDE.md hygiene is mandatory in every Build phase. Skipping = drift, drift = future pain.
- **Cross-repo tickets cannot move to Done on unit-test pass alone.** Unit tests prove each side is internally consistent with its own assumption of the contract; they do not prove the assumptions match. Manual end-to-end UAT is mandatory before Done, and is NOT deferred to the sibling ticket. See CLAUDE.md "Cross-repo contracts."