# Adding a New Skill

Quick guide for adding a reusable skill to this repository and installing it in Claude Code, Codex, and GitHub Copilot.

## 1. Create the skill

From the repository root:

```powershell
New-Item -ItemType Directory ".\skills\YOUR-SKILL-NAME"
code ".\skills\YOUR-SKILL-NAME\SKILL.md"
```

Use a distinctive, kebab-case name such as `branch-review` rather than a generic name such as `code-review`.

## 2. Add `SKILL.md`

Start with:

```yaml
---
name: YOUR-SKILL-NAME
description: Explain what this skill does and when an agent should use it.
---

# Instructions

Add the workflow here.
```

Keep shared skills agent-neutral. Avoid Claude-, Codex-, or Copilot-specific instructions and metadata unless they are truly required.

The folder name and `name` should match.

## 3. Validate it

```powershell
npx skills add . --list
```

Make sure the new skill appears.

Before committing, also check that the skill contains no secrets, private company information, or agent-specific assumptions that would prevent it from working elsewhere.

## 4. Commit and push

```powershell
git add .
git commit -m "Add YOUR-SKILL-NAME skill"
git push
```

The GitHub repository is the source of truth. Edit skills here rather than editing the copies installed for individual agents.

## 5. Install the new skill

Replace `YOUR_GITHUB_USERNAME/ai-agent-skills` and `YOUR-SKILL-NAME`:

```powershell
npx skills add YOUR_GITHUB_USERNAME/ai-agent-skills `
  --skill YOUR-SKILL-NAME `
  --global `
  --agent claude-code `
  --agent codex `
  --agent github-copilot `
  --copy `
  --yes
```

## Updating a skill

Edit the skill in this repository, commit and push the change, then refresh your installed copies:

```powershell
git add .
git commit -m "Update YOUR-SKILL-NAME skill"
git push

npx skills update --global --yes
```

## Quick checklist

- [ ] Distinctive kebab-case name
- [ ] Folder name matches `name`
- [ ] Clear `description`
- [ ] Instructions are agent-neutral
- [ ] No secrets or private information
- [ ] `npx skills add . --list` finds it
- [ ] Changes are committed and pushed
- [ ] Skill is installed/tested in the agents that should use it
