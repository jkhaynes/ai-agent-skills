---
name: reflect-skills
description: Find skill candidates in past Claude Code sessions. Reads what the user asked for over the last weeks, groups requests with the same intent however they were worded, and proposes the repeated workflows (with the corrections made along the way as guardrails) as new skills, then drafts the ones the user picks. Use this whenever the user asks what they keep doing by hand, which skills or commands they should make, to mine their session history for automation, "/reflect-skills", "what should I turn into a skill", or "look at my past sessions for patterns", even if they don't say "skill".
---

# Reflect skills

Repeated requests are the best evidence for a new skill: the user has already shown, several times, what they want and how they correct it. This skill reads recent sessions, finds those repeats by meaning rather than keywords, and drafts skills only for the ones the user picks.

Adapted from `/reflect-skills` in [claude-reflect](https://github.com/BayramAnnakov/claude-reflect) (MIT, Bayram Annakov; see `LICENSE`).

## Arguments

- `--days N`: sessions from the last N days (default 14).
- `--project <path>`: another project's sessions (default: the current folder).
- `--all-projects`: every project, for patterns that cross repos. Slower and much more text.
- `--dry-run`: propose candidates, write nothing.

## 1. Gather

```bash
node <skill-dir>/scripts/sessions.mjs --days 14 [--project <path> | --all-projects]
```

It prints the existing skills and commands, then each session's user prompts grouped by project, with slash commands kept as `/name args`. It drops tool output, system reminders, subagent briefs and continuation summaries. If it says there is no session folder, report that and stop.

With `--all-projects`, if the output is too long to read in full, rerun per project or with fewer days rather than skimming.

## 2. Find patterns by meaning

Reason about intent. "find X on linkedin", "linkedin lookup for Y" and "search linkedin for the CTO of Z" are one pattern; three prompts that merely contain "linkedin" are not. Look for:

- **Repeated workflows:** the same multi-step job asked for in several sessions.
- **Repeated corrections:** the same "no, do it this way" more than once. These become the skill's guardrails.
- **Skills already doing the job:** a pattern covered by an existing skill or command (from the script's list, or the session's own skills list) isn't a new candidate. Mention it under "already covered", and if the user keeps correcting that skill, suggest improving it instead.

A candidate needs at least three requests in different sessions. Skip one-off tasks, plain questions and anything a single instruction in CLAUDE.md would cover better.

## 3. Propose, then ask

Show the candidates grouped by project, strongest first:

```
reflect-skills: 41 sessions, last 14 days

Already covered: /ship (8 requests), branch-review (5)

1. demo-refresh (High), my-app
   Re-record the demo after UI changes: start the dev server, run record-demo, replace docs/demo.mp4
   Evidence: 4 sessions (09-28 "redo the demo video", 10-03 "the demo is stale again", ...)
   Guardrails: "use the seeded test data", "1080p, not 4K"
   Goes to: .claude/skills/ in that repo (all evidence from one project)

2. ...
```

Quote the user's words as evidence, briefly. Never quote anything that looks like a credential, key, token or personal data from a transcript.

Then use AskUserQuestion: which to draft, any renames, and where each goes. With `--dry-run`, stop after the proposal.

**Where skills go:**
- Evidence from one project: that repo's `.claude/skills/<name>/SKILL.md`.
- Evidence across projects: the user's skills repo if they keep one (for jkhaynes, `ai-agent-skills/skills/<name>/SKILL.md`, plus a line in its README's Skills list); otherwise `~/.claude/skills/<name>/SKILL.md`.

## 4. Draft the approved ones

Write each as `SKILL.md` with frontmatter `name` (lowercase, hyphens) and a `description` that says what it does and when to use it, with the phrases the user actually typed as triggers. The body gives the steps the sessions show, in order, and a guardrails section from the corrections. Match the style of the user's existing skills when there are any.

Don't commit. Tell the user the drafts are untested, list the files, and offer to refine and test them with skill-creator. A new skill shows up after a new session or `/reload-plugins`.

## Rules

- Nothing is written before the user picks candidates in step 3.
- Read-only until then: the script only reads transcripts and skill folders.
- Propose few, strong candidates. Five weak ones bury the one worth making.
