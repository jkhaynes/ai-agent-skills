---
name: ship
description: Ship the current branch end to end after one approval. Commits outstanding work, pushes, opens or updates the PR (linking the issue it closes), waits for CI and fixes small failures the branch caused, merges, pulls the base branch and deletes the branch. Use this whenever the user wants to get work merged or wrap up a branch, e.g. "/ship", "ship it", "commit and open the pr", "push and open a pr", "create the pr and merge it", "merge when CI passes", "merge the pr", "ci failed", "pull main and clean up the branch", even if they only name one of these steps.
---

# Ship

Getting a branch merged usually takes six or seven separate prompts: commit, push, open the PR, wait for CI, merge, pull the base branch, delete the branch. This skill does the whole chain after one approval.

That approval covers the whole chain, so the summary you show before it has to say everything that will happen, including side effects like a deploy that runs when the base branch changes. After the yes, don't stop to ask again unless something comes up that the summary didn't cover.

## 1. Preflight (read-only)

Run the bundled script from the repository:

```bash
node <skill-dir>/scripts/ship-preflight.mjs
```

It reports the base branch, current branch, uncommitted files, commits ahead and behind, any existing PR, which workflows run on pull requests and every step they run, whether a merge to the base deploys anything, the merge style the repo uses, whether GitHub auto-deletes branches, candidate issues and recent commit subjects. Read `CLAUDE.md`/`AGENTS.md` for commit and PR rules too.

Then settle these before writing the summary:

- **On the base branch with changes:** propose a new branch named like the repo's existing ones (`feat/…`, `fix/…`, `chore/…`, or a Spec Kit `NNN-name`) and ship from it. Never push straight to the base branch.
- **Nothing to ship** (no uncommitted changes, no commits ahead of base, no open PR): say so and stop.
- **What to commit:** the changes that belong to this branch's work. If unrelated work is mixed in, leave it out and say so in the summary. Never commit `.env` files, keys or credentials; if the preflight flags `SECRETS?`, stop and ask.
- **Behind the base:** if the branch is behind and the PR would conflict, say so in the summary and propose merging the base into the branch first. Don't rebase a branch that's already pushed unless the user asks.
- **Issue to close:** use the preflight's candidates, the branch name, the Spec Kit spec and the conversation. Link it with `Closes #N` only when you're confident it's the issue this work finishes. If unsure, name it in the summary as a question rather than linking it.
- **Existing PR:** reuse it. Update its description if the new commits change what it says.

## 2. Ask once

Show one summary and wait for an explicit yes:

```
Ship feat/sync-status-refresh -> main

Commit:   feat(membership): refresh Customer sync status on request
          <body, 2–4 lines>            [or: nothing to commit; 3 commits already on the branch]
PR:       new: "feat(membership): refresh Customer sync status on request"   Closes #114
Checks:   I'll run ci.yml's 12 local steps before pushing (lint, format:check, typecheck, tests, …);
          left to CI: npm run test:e2e (needs the e2e store)
CI:       ci.yml runs on the PR; I'll fix small failures this branch caused (up to 2 rounds)
Merge:    merge commit, once CI is green
On merge: ci.yml deploy-staging deploys main to staging
After:    pull main, delete feat/sync-status-refresh locally (GitHub deletes the remote one)

Ship it?
```

Spell out the **On merge** line whenever the preflight reports a deploy. A merge that deploys is the one consequence the user most needs to see before saying yes. If nothing deploys, say "nothing deploys".

If the user changes something (message, issue, base), show the revised summary. If they say no, stop and leave everything as it is.

## 3. Commit and push

- Commit in the repository's style: match the recent subjects (Conventional Commits with scopes, plain sentences, …) and any rules or trailers in `CLAUDE.md`/`AGENTS.md`. Stage the files by name rather than `git add -A`, so nothing unexpected rides along.
- If the preflight found workflows that run on pull requests, run the CI checks locally before pushing. The preflight's `ci steps` list is the exact set of `run:` commands from those workflows, in order, with the job and working directory for each. Run every step marked `run` (in that directory), not just lint and tests: format checks (`prettier --check`, `csharpier check`), contract and claim validators, typecheck and build are exactly the failures that are cheap to catch here. Leave the `skip:` steps to CI: installs (run them only if dependencies are missing), deploys, anything that needs secrets or service containers, and end-to-end suites. Don't add checks CI doesn't run. The goal is that the PR passes CI on its first run, not stricter rules than the repo has chosen.
- If a `run` step can't work on this machine (Docker isn't running for integration tests, an SDK isn't installed), leave it to CI and list it as skipped in the summary rather than stopping.
- Fix what fails the same way you'd fix it in CI (step 5): small failures this branch caused go into the commit, or a follow-up commit if the branch's commits are already pushed. Anything else is new information, so stop and ask. For a format check, run the repo's own formatter (`npm run format`, `dotnet csharpier format`) on the files this branch changed only, so unrelated files don't ride along. If the check also flags files this branch didn't touch, that's pre-existing drift or a local line-ending difference (Windows checkouts with `core.autocrlf`), not this branch's problem: judge the result on the branch's files alone and mention the rest in the report. A failure caught here costs seconds, while one caught by CI costs a push and a wait. In repos with no CI, skip all of this: the user has chosen to merge right after the PR opens.
- Push with `git push -u origin <branch>`. Never force-push. If the push is rejected because the remote moved, stop and report: someone or another session pushed to this branch, and the user should decide.

## 4. Open or update the PR

`gh pr create --base <base> --head <branch>` with a title in the commit style and a short body:

- what the change does and why, in a few bullets;
- `Closes #N` on its own line, when settled in step 1;
- how it was tested (what ran and the results; say so if nothing was run);
- any attribution lines the user's instructions require.

Keep it short. A reviewer should understand the change from the body without opening the diff.

## 5. Wait for CI

If the preflight found no workflows that run on pull requests, skip to step 6. In that case the user has chosen to merge right after the PR opens.

Otherwise watch the checks: `gh pr checks <number> --watch --fail-fast`. Run it in the background if your environment supports it. Checks can take a few seconds to register after the PR opens, so "no checks reported" just after creation means wait and look again, not "no CI".

### When a check fails

Get the failing log with `gh run view <run-id> --log-failed` (the run ID is in the check's link). Then decide:

- **Small and caused by this branch:** a lint or format error, a type error, a test that this branch's change broke where the fix is plain. Fix it, run that check locally if you can, commit (`fix: …` or the repo's equivalent), push, and watch again. At most **2 rounds** of this; record each fix for the final report.
- **Flaky or infrastructure:** a timeout, a runner or network error, a dependency download failure, a test unrelated to the diff that passed on the base. Re-run the failed jobs once with `gh run rerun <run-id> --failed`. This counts as one of the 2 rounds.
- **Anything else:** a failure you can't tie to the diff, a fix that changes behavior or a test's intent, missing secrets or permissions, a third failure. Stop and report what failed, why you think so, and what you'd do. This is new information the approval didn't cover, so ask.

Never weaken or skip a test, mark it as expected-to-fail, or bypass a required check to get green.

## 6. Merge

Just before merging, check that what you're about to merge is exactly what was approved and tested:

- The working tree has no new uncommitted changes since the approval, and `git rev-parse HEAD` equals the PR's head commit (`gh pr view --json headRefOid`). If either differs, another session or the user changed the branch: stop and ask. Merging without this check is how a branch gets merged before its latest changes are pushed.
- The PR is mergeable. GitHub reports `UNKNOWN` for a few seconds after a push while it works this out; wait and check again. If it needs a review approval or has conflicts, stop and report; don't use `--admin` to get around branch protection.

Merge with the repo's style and pin the head commit:

```bash
gh pr merge <number> --merge --match-head-commit <sha>    # or --squash, per the preflight
```

## 7. Clean up

- Switch to the base branch and `git pull --ff-only`. If the base branch is checked out in another worktree, pull it there instead (or skip the switch and say so).
- Delete the local branch with `git branch -d <branch>`. After a squash merge `-d` refuses, because the commits aren't on the base; delete it with `-D` only after `gh pr view <number> --json state` confirms `MERGED`.
- Delete the remote branch with `git push origin --delete <branch>` unless the preflight said GitHub deletes it automatically.
- If the merge started a deploy, find its run (`gh run list --branch <base> --limit 3`) and include its link. Don't wait for it to finish unless the user asked.

## 8. Report

End with a short report: the PR link and merge commit, the issue it closed, the CI result, and every fix you pushed during CI with a line on why. Add the deploy run link if one started, and the branch cleanup. Mention anything left over, such as unrelated changes you left uncommitted.
