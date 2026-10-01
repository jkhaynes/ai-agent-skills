---
name: new-project
description: Start a brand-new project from scratch. Creates a GitHub repo from the jkhaynes/project-template template (Spec Kit + Superpowers), runs its init script, then interviews the user to draft the product PRD, stack ADR, CLAUDE.md, testing.md, README, architecture sketch, and state.md, and hands off to /speckit-constitution and /speckit-specify. Use this whenever the user wants to start, kick off, spin up, or bootstrap a new project, app, repo, side project, or idea, even if they don't mention the template, Spec Kit, or a PRD.
---

# New Project

Take a project idea from "nothing" to "a pushed repo with real first-draft docs, ready for the first Spec Kit feature."

The template (`jkhaynes/project-template`) already contains the structure: `CLAUDE.md`, `AGENTS.md`, `docs/prd.md`, `docs/architecture.md`, `docs/state.md`, `docs/testing.md`, `docs/adr/`, `.specify/` (Spec Kit), `.claude/` (Spec Kit skills, Superpowers enabled), and `scripts/init-project.(ps1|sh)`. The skill's value is in filling those docs with the user's actual project, not in inventing new files. Edit the template's files in place and keep their headings and HTML comments, since the comments explain each section to future readers.

## Ask, never assume

This skill is a conversation, not a generator. Every fact that lands in the docs must come from the user: their own words, or an option they explicitly picked. The docs written here steer every later AI session, so a plausible-sounding guess baked into the PRD or ADR quietly becomes a requirement nobody chose.

- When something is unknown, ask. One question per message, with 2–4 concrete options drawn from what the user already said, plus room for their own answer. Suggesting options is fine; choosing one for them is not.
- If the user says "you pick" or "whatever you think", give a recommendation with a one-line reason and get an explicit yes before using it.
- If the user genuinely doesn't know yet, record it under **Open Questions** in `docs/prd.md` as their open question, not your answer to it.
- If the user is unavailable or the run is non-interactive, stop and wait. Do not fill gaps to finish the run; a half-finished setup with honest blanks beats a complete one built on guesses.
- Before writing each doc, show the user what you're about to write and get approval. Small, frequent confirmations are the point.
- **Check each new answer against earlier decisions.** New answers often quietly contradict old ones: "only my friends can use it" vs. a "no accounts" non-goal, "public demo" vs. an allowlist, "deploy early" vs. "access restricted from day one". When you spot a conflict, name both sides and ask which wins; then update whatever was already written. Catching these is one of the most valuable things this interview does.

## Dry-run mode

If the user says **dry run**, do everything except touching GitHub (the interview still happens in full):
- Instead of `gh repo create`, run `gh repo clone jkhaynes/project-template <target-path>`, then `rm -rf <target-path>/.git && git -C <target-path> init`.
- Run the init script with `-SkipPlugin` (PowerShell) or `--skip-plugin` as the second argument (bash).
- Commit locally, do not push.

## Phase 1: Create the repo

1. **Preflight.** Check `gh auth status`, `git`, `python3` (Spec Kit skills call `python3`; on Windows a missing alias is common, so warn), `claude`. `specify` is optional (only needed for upgrades). Stop on missing `gh`/`git`; warn on the rest.
2. **Collect basics.** Ask for anything the user hasn't stated; for anything inferred from their words (e.g. a slug derived from the name), confirm it:
   - Repo name (kebab-case slug) and display name (used for `[PROJECT_NAME]`). If they don't have a name yet, offer a handful of options grouped by vibe and ask what direction they like.
   - One-line description
   - Visibility (suggest **private**, but ask)
   - Parent directory (suggest `~/source/repos`, but ask)
   Read the full set back and get a yes before creating anything; a GitHub repo is the one step here that's annoying to undo.
3. **Create and clone.** From the parent directory:
   ```bash
   gh repo create <slug> --template jkhaynes/project-template --<visibility> --description "<one-liner>" --clone
   ```
   GitHub populates template repos asynchronously, so the clone can come back empty. If `CLAUDE.md` is missing, wait a few seconds and `git pull origin HEAD`; retry a few times before giving up.
4. **Init script.** From the repo root, on Windows run `pwsh -File scripts/init-project.ps1 -Name "<Display Name>"`, otherwise `bash scripts/init-project.sh "<Display Name>"`. This fills `[PROJECT_NAME]`/date placeholders and installs Superpowers at user scope. Commit: `chore: initialize from project-template`.

## Phase 2: PRD interview → `docs/prd.md`

This is the most important output. A good PRD is what keeps later AI sessions from over-building.

1. **Brain-dump first.** Ask the user to describe the idea however they like, or point to a notes file. Read it fully.
2. **Ask about purpose before anything else.** Is this a real tool for real users, a portfolio or learning piece, or both? Who are the users? The answer reshapes almost everything after it: users, success measures, how polished it must be, even stack choices.
3. **Fill gaps, one question at a time.** Map what you have onto the PRD sections (Problem, Users, Goals, Non-Goals, Core Capabilities, Success Measures, Constraints and Assumptions, Open Questions). Ask about every section that's thin or that you'd otherwise have to infer. Prefer multiple-choice suggestions derived from the brain-dump so answering is fast. The PRD's "Constraints and Assumptions" section holds the user's assumptions, not yours.
4. **Push on Non-Goals.** Users rarely volunteer them. Propose 3–5 concrete candidates ("No mobile app in v1", "No multi-tenant accounts", "No payments") based on what's adjacent to the idea and let the user keep/cut/add. Vague non-goals ("not over-engineered") are useless; each should name a specific thing an agent might otherwise build.
5. **Goals are outcomes, not features.** "Users find a matching job in under 5 minutes", not "has a search bar."
6. **Core Capabilities** become future Spec Kit features. Keep 3–8 rows, set the Spec column to `not started`. Have the user set each Release (v1 / v2 / later) and MoSCoW priority, and pick capability #1 (suggest the smallest thing that delivers real value; it's what they'll `/speckit-specify` first). Later-release ideas belong in the table too, so they aren't lost. If the PRD says the app gets deployed, suggest deployment as its own capability with its own spec, and check its order against anything that must exist before going live (e.g. sign-in).
7. **Show the full draft** to the user, revise until they approve, then write `docs/prd.md` and commit `docs: draft PRD`.

## Phase 3: Stack → ADR 0002, `CLAUDE.md`, `docs/testing.md`

1. Even if the user named languages or frameworks, a stack has more parts (data store, hosting, auth). Ask about each part that matters for this PRD and that they haven't settled. For each, offer 2–3 options with one-line trade-offs and a recommendation; they pick. Include "no custom code" options (existing SaaS, low-code tools they already pay for) when the PRD makes them plausible.
2. Show the ADR content, get approval, then write `docs/adr/0002-<short-stack-slug>.md` from `docs/adr/0000-template.md`: Status Accepted, today's date, Context from PRD constraints, the options considered, the decision, consequences. Add its row to the table in `docs/adr/README.md`.
3. In `CLAUDE.md`: fill **Stack** (one or two lines) and **Commands** with the stack's standard build/test/run/lint commands, marking them `# (expected, verify once scaffolded)` since no code exists yet. First settle repo layout and tooling (package manager, test runner, linter) as one suggested set the user approves or edits.
4. **Conventions** are worth a real discussion, not placeholders. Propose conventions that follow from decisions already made (secrets, data handling, where core logic lives), then recommend a naming convention and an error-handling pattern fitted to this stack and domain: language-standard naming, the casing of data crossing the API boundary, a small glossary of domain terms, and which failures are expected results vs. real errors (status codes, one error body shape, one place the frontend handles them). The user keeps, cuts, or edits each.
5. **`docs/testing.md`:** fill **Run** with the stack's test commands, the **Levels** table with this stack's frameworks and locations (cut levels that don't apply yet), and **Test Data** with what the PRD implies (e.g. labeled sample inputs). Keep the template's Rules unless the user wants changes. Show it before writing.

## Phase 4: Remaining docs

- **`CLAUDE.md` Project line:** replace the one-sentence placeholder with what it is and who it's for.
- **`README.md`:** replace the template README entirely. Short: project name, one-paragraph pitch (from PRD Problem/Users), status ("Early design; see docs/prd.md"), prerequisites from the stack, and a "How we work" line pointing at `CLAUDE.md`. Don't copy the template's instructions; they're about the template, not this project.
- **`docs/architecture.md`:** a first sketch only. Fill Overview, the mermaid flowchart, Components, and External Integrations from what the PRD and the approved stack actually say. Where the picture has a gap (e.g. which barcode API, where files are stored), ask rather than pick. Leave sections the user can't answer yet as their placeholders; speculative architecture is worse than an honest blank.
- **`docs/state.md`:** Current Focus: "Project setup complete; constitution next." Recently Done: repo created, PRD drafted, stack chosen (ADR 0002). Next Up: 1) `/speckit-constitution` (with the prepared input below), 2) `/speckit-specify` for capability #1 (name it). Put the prepared constitution input under **Notes for Next Session** so it survives the session.

**Constitution input.** The template ships a starter constitution (TDD, Superpowers owns implementation). Don't edit `.specify/memory/constitution.md` directly; `/speckit-constitution` owns it. Instead, prepare a short argument for it: 3–6 project-specific principles derived from the PRD and stack (e.g. "All data stays local; no third-party telemetry", "Every external API call has a timeout and a degraded fallback"). Each principle should trace to a PRD constraint, non-goal, or the stack ADR. Present them to the user to keep, cut, or reword.

Show the README, architecture sketch, and state.md before writing them. Commit `docs: initial architecture, ADR, README, and state` and push (skip push in dry run).

## Phase 5: Handoff

Spec Kit's skills live in the new repo's `.claude/skills/`, so they're only available in a Claude Code session started there. End with a short message:

```
Repo: <github url> (cloned to <path>)
Drafted: PRD, ADR 0002 (<stack>), CLAUDE.md, testing.md, README, architecture sketch, state.md
Open questions you deferred in the PRD: <count>

Next:
  cd <path>
  claude
  /speckit-constitution <prepared input>
  /speckit-specify <capability #1 one-liner>
```

## What not to do

- Don't scaffold application code (`dotnet new`, `npm create`, etc.). The first Spec Kit feature owns that, so its plan and tests shape the scaffold.
- Don't create CI workflows, branch protection, or GitHub issues. `/speckit-taskstoissues` covers issues later.
- Don't run `/speckit-implement`; the template's workflow uses Superpowers for implementation.
