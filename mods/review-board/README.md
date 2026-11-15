# review-board

A Claude Code mod that puts my review panel dashboard in a pane beside the chat, plus the subagents the session is running. It's the in-chat version of `scripts/dashboard.py` from my project template: the same board, without a browser tab.

The pane shows:

- **Subagents:** every subagent this session starts (reviewers, the fixer, the approver, Superpowers' task subagents), with its type, task, how long it has run, and ● running, ✓ done or ✕ failed. **clear finished** removes the done ones.
- **Panel:** the reviewers in `.claude/agents/reviewer-*.md` and the model each uses.
- **Features by stage** (Design, Build, Review, Decision, Merged): tasks.md progress, current activity, each reviewer's verdict, the round (of 3) and CI. Features that need you are outlined in pink.
- **Detail:** click a feature for its branch and worktree, the approver's decision, verdicts per round, the PR and its files. Click a file to read it in the pane; **Back** returns.
- **Buttons:** **Needs you** filters to features waiting on you, **Merged** shows merged features (hidden by default), **Refresh** re-reads now.

Minimized on the desktop app, it shrinks to "N need you · M subagents running".

`/board` opens the pane. It also opens by itself in a folder that has `scripts/dashboard.py`.

## Where the data comes from

The board comes from the project's own `scripts/dashboard.py`, run once per refresh, so the pane and the browser dashboard always agree:

- `dashboard.py --json` prints the board. The last CI results go in on stdin, so squash-merged branches still count as merged.
- `dashboard.py --ci-json` prints each active branch's PR checks from `gh`.
- `dashboard.py --file <feature> <path>` prints one file a feature lists.

These modes are in the project template's `scripts/dashboard.py`. A repo with an older copy shows "predates --json" in the pane until you copy the new script over.

Each session reads the repo it runs in. A session in any worktree shows the whole repo's board, since `dashboard.py` reads every worktree and branch. Subagents are per session.

The script runs only while the pane is open and the front tab: at most every 15 seconds, and straight away when the pane comes back into view. CI is checked at most once a minute, also only while the pane is showing. While the pane is closed, the mod only checks every 2 seconds whether it's open, which starts no process. Subagents are recorded whether or not the pane is open.

Python is found as `python`, `python3` or `py`, whichever runs Python 3 first.

## Install

Load it in one session with:

```bash
claude --plugin-dir <path-to>/ai-agent-skills/mods/review-board
```

To load it in every session (including the desktop app), add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, separated from the other mods by `;` on Windows:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "<path-to>/ai-agent-skills/mods/job-progress;<path-to>/ai-agent-skills/mods/review-board"
  }
}
```

It can run beside `savvy-progress`: that one's agents panel covers cost and context per subagent, and this one ties subagents to the review board.

## Develop

```bash
claude plugin validate mods/review-board
claude plugin test mods/review-board
```

The tests mount the pane on the terminal and desktop surfaces with a seeded board, and step a mocked clock to check the script runs only while the pane is shown.
