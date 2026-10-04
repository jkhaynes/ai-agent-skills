# spec-resume

A Claude Code mod that tells Claude where work left off in a Spec Kit repo, so a fresh session or a `/clear` doesn't start with "where were we?".

On `startup` and `clear`, a SessionStart hook adds a short block of context:

```
Spec Kit resume (from the spec-resume hook, clear):
Branch: 001-capture-centering, 3 uncommitted file(s), 2 unpushed commit(s)
Feature: specs/001-capture-centering, from branch name (14/36 tasks done across 6 phases)
Current phase: Phase 3: User Story 1 (5/11 done)
Unchecked tasks:
  - T015 Handle unreadable HEIC uploads with a 422 and a retake hint …
  - T016 …
After that: Phase 4: User Story 2 – Retake advice
To read one phase without loading all of tasks.md, use the phase-done skill's scripts/phase-tasks.mjs (show <phase>).
Open PR for this branch: #12 Capture and centering MVP https://github.com/…
Current Focus:
  …from docs/state.md
Next Up:
  …
```

It never changes anything. It stays silent in a repo without a `specs/` folder, and in one whose `origin` remote isn't on GitHub under an allowed owner.

### Owner allowlist

The hook copies `tasks.md` and `state.md` text into Claude's context at session start, where it carries more weight than a file Claude reads on its own. In a repo someone else controls, that would let them write part of what Claude is told. So the hook only runs when `remote.origin.url` is a GitHub repo owned by `jkhaynes`, in either the `https://github.com/…` or `git@github.com:…` form. Repos with no remote, forks under other owners, and lookalike names such as `jkhaynes-evil` get nothing. The check runs before `git status`, which can run commands set in a repo's own `.git/config`.

To allow other owners, set `SPEC_RESUME_OWNERS` (comma-separated, case-insensitive) in the `env` block of `~/.claude/settings.json`; it replaces the default list:

```json
{ "env": { "SPEC_RESUME_OWNERS": "jkhaynes,my-org" } }
```

| Piece | Source |
| --- | --- |
| Branch, uncommitted files, unpushed/behind counts | `git status`, `git rev-list @{upstream}...HEAD` |
| Feature | a `specs/` folder named after the branch or sharing its `NNN-` prefix; otherwise `.specify/feature.json`, which Spec Kit leaves pointing at the last feature after a branch switch |
| Phase and unchecked tasks | the first `## ` section of `tasks.md` with an unchecked `- [ ] T…` task, at most 12 tasks, 140 characters each |
| Open PRs | `gh pr list` (5 s timeout; skipped if `gh` is missing or signed out) |
| Focus, next steps, blockers | the `Current Focus`, `Next Up` and `Blockers / Open Questions` sections of `docs/state.md`, when present |

It pairs with the [`phase-done`](../../skills/phase-done/SKILL.md) skill: `phase-done` closes a phase and updates `state.md`; after `/clear`, this hook hands the next phase back.

## Install

```bash
claude --plugin-dir <path-to>/ai-agent-skills/mods/spec-resume
```

To load it in every session, add it to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (separate several mods with your platform's path separator, `;` on Windows):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "<path-to>/ai-agent-skills/mods/job-progress;<path-to>/ai-agent-skills/mods/spec-resume"
  }
}
```

## Develop

```bash
claude plugin validate mods/spec-resume
echo '{"cwd":"<some spec kit repo>","source":"clear"}' | node mods/spec-resume/hooks/session-start.mjs
```

The task parsing matches `skills/phase-done/scripts/phase-tasks.mjs`. The two are installed separately, so each keeps its own copy; change both together.
