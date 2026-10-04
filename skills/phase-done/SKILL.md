---
name: phase-done
description: Close out a finished Spec Kit phase in one pass. Checks off the phase's completed tasks in tasks.md, runs that phase's tests, sweeps spec docs and comments for stale references, anchors and claims the phase made wrong, updates docs/state.md, then asks once to approve a single commit summary and names the next phase. Use this whenever the user says a phase is done or wants to wrap one up, e.g. "phase done", "/phase-done", "wrap up this phase", "check in changes and update stale anchors", "make sure tasks.md is checked off", "update stale references and commit", or right after /speckit-implement finishes a phase, even if they only ask for one of these steps.
---

# Phase Done

After `/speckit-implement` finishes a phase, the same five follow-ups always come next: check off the tasks, fix the docs the phase made stale, run the tests, commit, and work out what's next. Each one usually costs its own prompt. This skill does them in one pass and asks for approval once.

The approval matters. Nothing gets committed until the user has seen one summary of what will be committed and said yes. Everything before that point is local, reversible work: editing checkboxes, fixing doc text, running tests.

## The tasks.md helper

Spec Kit `tasks.md` files grow large (over 200 KB in long features), and reading the whole file several times per phase burns a lot of context. Use the bundled script for all tasks.md reads and checkbox edits rather than opening the file:

```bash
node <skill-dir>/scripts/phase-tasks.mjs status            # every phase with done/total; "->" marks the current one
node <skill-dir>/scripts/phase-tasks.mjs show 7            # just Phase 7's section (also: current, next, last-done, or a heading fragment)
node <skill-dir>/scripts/phase-tasks.mjs changed           # checkboxes flipped since HEAD, grouped by phase
node <skill-dir>/scripts/phase-tasks.mjs check T041 T042   # mark tasks done, keeping the file's [X]/[x] style and line endings
```

It finds the feature from a `specs/` folder matching the branch name or its `NNN-` prefix, falling back to `.specify/feature.json`. Pass `--feature specs/NNN-name` or `--file path/to/tasks.md` to override. Only use Read on tasks.md for the header (its first ~30 lines hold the task discipline and format rules), never the whole file.

## Workflow

### 1. Work out which phase finished

In order of preference:

1. The phase the user named ("phase 7 is done").
2. The phase you just implemented in this conversation.
3. `changed`: the phase whose checkboxes flipped since HEAD.
4. `status`: if the current phase has a mix of done and open tasks, that one; if it shows all phases before the current one complete with nothing changed, the `last-done` phase, checked against `git log` for recent work.

If these disagree or none applies, ask which phase. Say which phase you picked and why in one line, then run `show <phase>` to load its section.

### 2. Reconcile the checkboxes with what actually happened

For each task in the phase, decide from evidence (the diff, the files named in the task, test results) whether it is done:

- Done and unchecked: check it with the script.
- Done and checked: leave it.
- Not done, or only partly done: leave it unchecked and list it in the summary with what is missing. A checked box is a claim that the work exists; a wrong one misleads every later session, so don't check off a task to make the phase look complete.
- Test-first tasks ("write failing tests ..."): done when the tests exist, cover what the task names, and now pass against the implementation. You usually can't see the earlier red run from a fresh session, and that's fine; don't hold the box back for it. If the task or project explicitly asks for the red result to be *recorded* (an evidence file, a note under the task) and that record is missing, check the task anyway and list that under "Decisions made without you".
- `[MANUAL]` tasks and manual QA steps: only the user can do these. Check them only if the user has said they passed. Otherwise list them as waiting on the user.

If the project keeps notes under tasks (indented lines like "Validated: 665 Vitest tests ..."), follow its lead and add a short evidence line under tasks you checked, using the same style.

The diff for the phase is the working tree against HEAD plus any commits on this branch made for the phase (`git log --oneline <base>..HEAD` and `git diff <base>...HEAD`, where base is the default branch). Don't assume all branch commits belong to this phase; long branches hold many phases.

### 3. Run the phase's tests

Find the tests from three places: test files the phase's tasks name, test files in the diff, and the project's own test instructions (`CLAUDE.md`, `AGENTS.md`, `docs/testing.md`, `package.json` scripts, the tasks.md header). Run the targeted tests first, then the cheap project-wide checks the project expects before a commit (typecheck, lint). Run long suites in the background if your environment supports it.

Use the project's shell conventions: on Windows with PowerShell, give PowerShell syntax (`$env:X = '1'`, not `export X=1`).

If something fails, stop before committing. Report the failures, say whether they come from this phase's changes or were already failing, and ask how to proceed. Work that out from the diff (a failing test in a file this phase created or changed is this phase's), not by stashing, resetting or checking out over the user's working tree. If you really need the base's result, use a separate `git worktree`. Don't adjust a test to make it pass unless the test is plainly wrong, and say so if you do.

Don't run end-to-end suites against live or shared environments (staging, a real store, production data) unless the project's instructions say that's how its e2e runs. Skipping one is a decision; list it under "Decisions made without you".

### 4. Sweep for stale references

A phase that renames, moves, removes or changes behavior leaves text elsewhere describing the old world. Find it while the diff is fresh:

1. From the diff, list what changed shape: removed or renamed functions, types, files, routes, env vars, config keys, migrations, error codes, UI copy, and any behavior the phase reversed.
2. Search for the old names across the spec folder (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`, the tasks.md text of *open* tasks), `docs/`, `README.md`, `CLAUDE.md`/`AGENTS.md`, and code comments. Grep for the names; don't read whole spec docs top to bottom.
3. Check anchors: `path/to/file.ts:95`-style line references and `#heading` links in docs that point at files this phase changed. Confirm each still lands on the thing it names; update the line number or heading when it moved.
4. Check claims: statements in the spec docs about behavior this phase changed ("returns 409 when ...", "retries three times"). Fix the ones that now say the opposite of what shipped.

Leave checked tasks' text and history files (`*-history*.md`, ADRs, changelogs) alone: they record what was true then. Fix text that describes the system as it is now, and open tasks that would mislead whoever implements them.

Keep the sweep to what this phase made stale. Mention pre-existing problems you notice in one line after the commit, and don't fix them in this one. A claim you had to choose how to fix (rewording a requirement rather than a name) is a decision; list it under "Decisions made without you".

### 5. Update docs/state.md

If the project has `docs/state.md` (or a similar session-memory file named in `CLAUDE.md`), update it the way its own comments ask: usually move the finished phase into **Recently Done** as one line, set **Current Focus** and **Next Up** to the next phase, and update the "Last updated" date. Replace stale lines rather than appending forever. Skip this step if no such file exists; don't create one.

### 6. Ask once, then commit

Show one summary and wait for an explicit yes:

```
Phase 7: Preview behavior (US6) is done.

Tasks:    checked T038–T041 (4/4)        [or: 3/4; T041 still open: <what's missing>]
Tests:    tests/integration/preview.test.ts 12 passed; typecheck clean
state.md: Current Focus -> Phase 8

What changed vs the plan:
- T039 asked for previews to expire after 5 min; the code uses 15 min (the provider's minimum).
- T040 named `previewChange()`; it shipped as `buildPreview()`.

Decisions made without you:
- Updated spec.md FR-009 to say 15 min, to match what shipped.
- Left the e2e preview spec unrun; it needs the shared staging store.

Commit:   feat: show a dry-run preview before confirming a configuration change
          <body: 2–4 lines on what the phase delivered and why>

Commit this?
```

The two lists are the point of the summary: they're what the user can't see from the task checkboxes.

- **What changed vs the plan:** compare what the phase's tasks (and the spec and plan behind them) said to build with what the diff actually does. List each place they differ: different names, behavior, scope added or dropped, a task done another way than written. If the phase was built exactly as written, say so in one line.
- **Decisions made without you:** every judgment call you or the implementing session made that the user didn't explicitly ask for, such as rewording a requirement to match the code, choosing between two readings of a task, leaving a test unrun, or checking a task whose evidence was incomplete. If there were none, write "None".

Don't list the routine doc fixes (renamed references, moved line anchors) or the files being committed; the user can ask for those.

Match the repository's commit style: look at `git log --oneline -15` for prefixes (`feat:`, `fix:`, `docs:`), tense and body conventions, and follow any commit rules in `CLAUDE.md` or `AGENTS.md`, including required trailers. If the work clearly splits (for example, code changes and a separate stale-reference cleanup the repo usually commits on its own), propose those commits together in this one summary; it's still one approval.

On yes, stage only the files the phase and this skill touched (not unrelated work in the tree, and never `.env` files or secrets), commit, and show the resulting `git log --oneline` lines. Don't push, open a PR or merge: those belong to a separate step the user starts.

If the user asks for changes to the summary, apply them and show the revised summary. If they say no, leave the edits in place uncommitted and say so.

### 7. Name the next phase

End with what comes next, using `status` and `show next`:

```
Next: Phase 8: Retry, cleanup, and complete progress UI (US7), 6 tasks, starting with T044 (write failing retry tests).
```

If the next phase depends on something outside the code (a manual step, a decision, a deploy), say that first. If every phase is complete, say so and point at what usually follows in the project's workflow (for example `/speckit-converge`, a branch review, or a PR).
