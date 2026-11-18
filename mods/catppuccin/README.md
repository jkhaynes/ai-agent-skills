# catppuccin

A theme for the Claude desktop app's Code tab: Catppuccin Mocha in dark mode and Latte in light mode, with Catppuccin pink as the accent and a sakura backdrop (blossoming branches in the corners, petals drifting down, the middle left clear for the conversation). Petals stop falling when your system is set to reduce motion.

The backdrop draws in the desktop app (and mobile). A terminal session loads the mod but has no backdrop to show.

## Install

At the prompt of a terminal `claude` session:

```
/plugin install catppuccin --marketplace jkhaynes/ai-agent-skills
```

Answer `y` to add the marketplace, then pick the **user** scope so every session gets it. Restart the desktop app to see it there.

From a shell instead:

```
claude plugin install catppuccin --marketplace jkhaynes/ai-agent-skills
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `jkhaynes/ai-agent-skills`, then **Add plugin**.

## Run from a clone

Add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (paths separated by `;` on Windows, `:` elsewhere), then restart the app.

## Credits

Colors from [Catppuccin](https://github.com/catppuccin/catppuccin) (MIT). `hooks/make-colors.js` is Claude Code's theme helper, included unchanged.
