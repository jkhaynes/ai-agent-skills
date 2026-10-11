# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-flow) skill, and useful with any subagents.

This is a pink copy of [johnnyvizz/claude-kit `plugins/savvy-progress`](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) (MIT, see `LICENSE`), taken at upstream commit `272a877` (2026-10-04, version 1.2.0).

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **Agents panel** (`/agents-info` toggles it): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. This covers every subagent, not only savvy ones. In this copy each agent is a sitting pink cat with its role or tier colour on its collar (upstream draws crabs). Working cats walk, and each savvy tier animates its prop beside the cat: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag, and an Explore agent wears an eye patch and fences with a cutlass. `prefers-reduced-motion` stops them.

## What this copy changes

Three things: it follows superpowers' subagent-driven development as well as savvy-flow, it's pink, and its agents are cats instead of crabs. Tool names and state keys are upstream's, so savvy-flow still drives it as before.

### Superpowers

Superpowers dispatches every worker as `general-purpose`, so this copy reads each one's role from the description its prompts give it:

| Description | Role | Costume |
| --- | --- | --- |
| `Implement Task N: <name>` | implement | engineer (turning wrench) |
| `Review Task N (spec + quality)`, `Re-review Task N fix round R` | review | detective (sweeping magnifier) |
| `Review code changes` | final review | astronaut |

Any other agent keeps its type and stays grey; Explore agents get the explore costume, as upstream.

- **Rounds:** runs of the same role on the same task number count as rounds, so a re-review shows as `review · round 2`. Other agents still count rounds by identical descriptions.
- **The bar:** an `Implement Task N` dispatch starts it, titled `superpowers`. Subagent-driven development only starts a task once the one before it is accepted, so each implemented task below the newest counts as accepted, and all of them do once the final review starts. A successful final review finishes the bar. Without a reported plan the bar shows `Tasks 3 accepted`; with one, `Tasks 3/8`. A final review with no flow running (plain `requesting-code-review`) starts nothing.
- **The plan:** the `progress` tool's description asks Claude to report the plan when subagent-driven development or `/speckit-implement` starts, each task titled `Implement Task N: <name>` with tier `implement`. Planned tasks are matched to runs by task number, so a dispatch worded a little differently still counts. This relies on Claude making the call.

The `step` tool is unchanged: superpowers' implementer prompt doesn't ask workers to call it, so they show their context fill instead.

### Colours

| Part | Upstream | This copy |
| --- | --- | --- |
| Bar and accent | `#8f8cf4` (purple) | `#e8b4d0` (dusty pink) |
| Finished bar | `#5fbf8f` | `#a6d9a8` |
| Agent figure | a crab, `#D97757` (clay) | a sitting cat, `#e8a0c0` (pink), collar in the role colour |
| Text on the bar's pill | `#ffffff` | `#2a1f27`, readable on pink |
| Dark-mode text, muted, track, tile | neutral greys | `#f2e1e8`, `#b39ca8`, `#2f2430`, `#29202a` |
| Light-mode neutrals | neutral greys | the same greys warmed toward pink |
| Tier colours (fable, heavy, careful, medium, light, other) | `#7F77DD` `#D85A30` `#BA7517` `#378ADD` `#1D9E75` `#888780` | `#f5a8c8` `#f0a58f` `#e8c48f` `#9fc3e8` `#a6d9b8` `#b39ca8` |
| Done and failed marks | `#3B9C5F`, `#D0453F` | `#7cc48f`, `#e07a8a` |

The palette matches my Catppuccin Pink skin for the skins mod. Superpowers roles take the colour of the costume they wear.

To take a newer upstream version, merge its `hooks/register.tsx` into this one by hand. `hooks/pink.test.ts` fails if the bar falls back to upstream's colours, and `hooks/superpowers.test.ts` if the superpowers tracking is lost.

## Tools it adds

- `mcp__savvy-progress__progress`: the orchestrator reports the plan, phase and accepted tasks.
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A worker that does not report shows its context fill in grey instead.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`), not a bill.

## Settings

`language`: `auto` (default), `en` or `ru`. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "en" } } } }
```

## Install

Load it in one session with:

```bash
claude --plugin-dir <path-to>/ai-agent-skills/mods/savvy-progress
```

To load it in every session (including the desktop app), add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, separated from the other mods by `;` on Windows:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "<path-to>/ai-agent-skills/mods/job-progress;<path-to>/ai-agent-skills/mods/savvy-progress"
  }
}
```

Don't also install upstream's `savvy-progress@claude-kit`: both register the same plugin name and tools.

## Develop

```bash
claude plugin validate mods/savvy-progress
claude plugin test mods/savvy-progress
```

## Limits

- The terminal surface also takes the bar's SVG branch. Under `claude plugin test` that branch draws an empty box next to the `×N` and `✕` buttons, so the plain-text bar may never show in a terminal. This comes from upstream and hasn't been checked in a real terminal.
- While a flow is reported, the band hook answers without passing on to the hooks beneath it, so another mod's band above the prompt (the skins mod's usage rings) can be hidden until you press `✕`. Which one shows depends on load order.
