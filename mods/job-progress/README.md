# job-progress

A Claude Code mod that shows a live **Progress** pane for long-running jobs Claude runs: unit, integration and e2e test suites, scenario/eval runs, batch runs such as test images through a capture pipeline.

Each job gets a soft pink bar with a green growing tip, a plant that grows as the job runs, pass/fail counts, elapsed time, an ETA and the latest output line. When the job ends it either **blooms** or **wilts**:

```
● Run capture tests  1m 12s
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱  58%
🌰 → 🌱 → 🌿 ·  ·
23/40 · ✓21 · ✗2 · ~52s left
› PROGRESS 23/40 altaria_back.jpg

✿ Unit tests  34s
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰ 🌸 bloomed
🌰 → 🌱 → 🌿 → 🪴 → 🌸
88/88 · ✓88

✗ Scenario eval  4m 03s
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰ 🥀 wilted
🌰 → 🌱 → 🌿 → 🪴 → 🥀
100/100 · ✓97 · ✗3
```

A toast says "🌸 … bloomed" or "🥀 … wilted" when a job finishes. To remove finished jobs, run `/progress clear`, which works everywhere. Clicking **Clear finished** works in the desktop app and the fullscreen terminal. In the regular terminal, the button only responds to the `c` key while the pane has focus.

## How it works

| Piece | What it does |
| --- | --- |
| `tool.call` (Bash, PowerShell) | Remembers each shell call's description as the job's label. Moves known test runners (vitest, jest, Playwright, pytest, `dotnet test`, `go test`, `cargo test`, `npm/pnpm/yarn/bun test·e2e·bench`) to the background when the call didn't choose. |
| `session.append` | Picks up a job from the shell result row ("running in background with ID: X. Output is being written to: P") and marks it finished from its `<task-notification>` row. |
| `$.clock.every(1500)` | Re-reads each running job's output file when it grows and parses progress from it. |
| `tool.describe` | Adds a line to the Bash/PowerShell tool descriptions asking Claude to background long jobs and to print `PROGRESS <done>/<total> <item>` lines from scripts it writes. |
| `ui.render` (Pane) | Draws the pane. `/progress` opens it on demand. |

Only background jobs are tracked: a foreground command's output isn't visible until it ends.

### Progress parsing (`hooks/parse.ts`)

In order of preference:

1. `PROGRESS 3/10 label` lines: the convention for custom scripts.
2. `[12/40]` counters (Playwright list reporter).
3. A bare `n/m`.
4. A percentage, plus a planned total from `Running 40 tests` / `collected 40 items`.

Pass/fail counts come from runner summaries (`88 passed`, `3 failed`, `Passed: 41`, `Failed: 1`), or from per-test marks (✓ ✗ PASS FAIL ok / not ok) while a run is still going.

## Install

The mod is a plugin folder. Load it in any session with:

```bash
claude --plugin-dir <path-to>/ai-agent-skills/mods/job-progress
```

To load it in every session (including the desktop app), add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "<path-to>/ai-agent-skills/mods/job-progress"
  }
}
```

## Develop

```bash
claude plugin validate mods/job-progress
node mods/job-progress/hooks/parse.check.mts
claude plugin test mods/job-progress
```

`parse.check.mts` is a plain Node self-check for the parser (Node 22+ runs the TypeScript import directly). `hooks/tool-call.test.ts` checks the shell-call rewrite (backgrounding, dropping tail/head pipes, `PYTHONUNBUFFERED`) under `claude plugin test`.

Gotcha found while building it: inside a `Text`, use arrays of `Text` children, not fragments (`<>…</>`). A fragment there is refused as "Box inside an inline element", and the engine draws an empty pane instead.

## Limits

- Output files over 4 MiB stop updating (the `$.fs.read` cap); the pane keeps the last reading.
- Auto-backgrounding applies to quick unit test runs too, so Claude waits for the completion notice instead of reading output inline. Remove the `RUNNER` rewrite in `hooks/register.tsx` if that gets in the way.
- Labels are kept in module memory, so a job started just before a mod reload shows as "Background job".
- A job piped through `| tail -N` or `| head -N` shows no progress until it ends. The mod drops a trailing tail/head pipe from commands it backgrounds and asks Claude not to add one, but other filters (`| grep …`) still hide progress.
- Python buffers output written to a file; scripts should run with `python -u` (or flush) for live `PROGRESS` lines.
