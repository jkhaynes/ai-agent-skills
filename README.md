# AI Agent Skills

My reusable Agent Skills for Claude Code, Codex, and GitHub Copilot.

Each skill lives under skills/<skill-name>/SKILL.md.

Install all skills with:

npx skills add jkhaynes/ai-agent-skills --skill '*' --global --agent claude-code --agent codex --agent github-copilot --copy --yes

## Mods

Claude Code-only plugins (function hooks: panes, bands, toasts) live under mods/<mod-name>/. They aren't installed by `npx skills`; each mod's README says how to load it.

- [job-progress](mods/job-progress/README.md): live Progress pane for long-running test, scenario and batch jobs, with a pink bar and a plant that blooms or wilts.
![job-progress demo](mods/job-progress/docs/job-progress.gif)
