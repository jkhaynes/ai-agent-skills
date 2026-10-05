---
name: record-demo
description: Record a narrated, subtitled demo video of a web app by driving a real browser with Playwright, with an AI voiceover (edge-tts) and burned-in subtitles mixed in by ffmpeg, shot by shot, then stitched into one 1080p MP4. Use this whenever the user wants a demo video, screencast, walkthrough video, product tour, screen recording, or video for a portfolio, README, app-store review, launch post or pitch of a website or web app they built, even if they don't say "Playwright" or "narration", and even if they only ask to "record my app", "make a video showing how X works" or "film a quick tour". Not for terminal or CLI recordings, or for editing existing footage.
---

# Record a narrated demo

You'll produce a demo video the way a careful person would film one: plan what to say, rehearse the clicks, record one shot at a time, check every take, and only then cut them together. A script drives the browser, so the result is repeatable: a shot can be retaken in a minute once the app changes or a line needs rewording.

What makes these videos good isn't the tooling, it's discipline about what's on screen while each line plays. Viewers follow the voice and the cursor. When the two drift apart, or the cursor sits still in silence, the video feels broken even if every step worked. Most of this skill is about keeping them together.

The pipeline:

1. **Storyboard:** shots, steps, narration lines and models, signed off by the user before anything is filmed.
2. **Setup:** copy the bundled scripts into the project, check dependencies, sign in by hand if the app needs it.
3. **Per shot:** write the spec, voice the lines, record, mix, review a contact sheet, fix, repeat. Hand this to subagents on a cheaper model where you can (see "Delegating shots").
4. **Stitch:** join the mixed shots into the final MP4 and hand it over.

## Who does what, and on which model

The judgment-heavy parts are cheap in tokens but decide the video's quality: what to show, what to say, and whether a take is good enough. Keep those with yourself, on the session's main model. The per-shot loop is the opposite: many tool calls, logs and retakes, but mechanical once the brief is precise. That loop is where tokens go, so hand it to subagents on a cheaper model.

| Work | Who | Model |
| --- | --- | --- |
| Reading the project, storyboard, narration, approval | you | the session's model |
| Setup (copying scripts, dependency check, sign-in) | you | the session's model |
| Recording one shot end to end: spec, voice, record, mix, contact sheet, self-review, retakes | a shot subagent | recommended per shot, chosen by the user (below) |
| Re-mixing or re-stitching after a wording change, with no re-recording | a subagent | `haiku` |
| Final review of every contact sheet, stitching, the hand-over | you | the session's model |

If your environment has no subagent tool (the Agent or Task tool), do the per-shot work yourself in the same way.

### Recommending a model for each shot

The user makes the final call on cost versus reliability, so recommend a model for each shot and let them change it. Judge each shot by what will make it hard to record, not by its length:

| Recommend | When the shot is like this |
| --- | --- |
| `haiku` | A few steps on plain, well-labelled pages: buttons and fields with clear names, no sign-in, no iframes, no custom widgets. For example, typing into a search box and pointing at results. |
| `sonnet` | The usual case: multi-step forms, content that loads or changes as you act, native dropdowns and date pickers, a signed-in profile, state that must be reset between takes. |
| the session's model | The hardest shots: third-party sign-in or consent screens, captchas, iframes or shadow DOM, code editors, components with unlabelled or unstable markup, and one-way steps that can't be retaken (delete, uninstall). Also any shot that already failed twice on a cheaper model. |

When a shot sits between two levels, recommend the stronger one. A failed take, with its reset and retake, usually costs more than the price difference.

Put the recommendation in the storyboard, one line per shot with the reason ("Shot 3 · sonnet: native date picker and a reset between takes"). Ask the user to confirm or change it when they approve the narration. They can change one shot ("shot 2 on haiku") or all of them ("everything on sonnet"), and their choice always wins over your recommendation. If they've told you to go ahead without review, use your recommendations, and list which model recorded each shot in the hand-over.

During recording, if a shot fails twice on its chosen model, don't silently upgrade it. Tell the user which shot failed and why, recommend the next model up, and go ahead with their choice. If they've said not to wait, upgrade it yourself and report it at the end.

## 1. Storyboard first

Read enough of the project (README, routes, main screens, and the code behind any claim you'll narrate) to know what it does and what's worth showing. Then ask, or infer from the request:

- **Audience and purpose:** a portfolio piece wants the impressive parts in under two minutes; an app-store or client review wants the full flow, setup to teardown.
- **Where it runs:** a local dev server, a deployed URL, or a static file. Whether it needs a sign-in, and as whom.
- **What must stay off screen:** real names, emails, API keys, other customers. Replace them with demo data before recording, or list them in DEMO_REDACT with stand-ins (see Setup).

**Show each feature fully.** Viewers judge a project by what they see it do, so a demo that only skims the obvious undersells it. For each feature in scope, show the behaviors that make it good: for a search, that it matches inside note bodies as well as titles, ignores case, highlights the matches, and comes back when cleared, not just that typing filters a list. Read the code to find these. Unless the user gives a length, let coverage decide it: about 45 to 90 seconds for a small app's main feature is normal, and "quick" means no padding, not fewer features. Don't narrate what anyone can see without being told ("the list filters as I type"); say what it means or why it matters.

Write the storyboard as a numbered list of shots. Each shot is one continuous recording of one idea, usually 20 to 60 seconds, and lists its steps with the narration line spoken during each step:

```
Shot 2 · Adding a task (about 25s) · sonnet: native day picker, and the task must be removed between takes
  Step: click "New task", type "Water the ferns"   Say: "Adding a task takes a name,"
  Step: pick Tuesday, click Add                     Say: "and the day it's due, and it's on the list."
  Step: tick the task                               Say: "When it's done, one click crosses it off."
```

How to write the narration:

- **Write it as one voiceover first, then split it.** Draft the whole shot's narration as a short paragraph that sounds good read aloud, with full sentences and a natural rhythm. Then split it into lines at sentence or clause breaks, so each line is spoken during its step. Lines of about 2 to 5 seconds (30 to 75 characters) sound best. Fragments of a second or two ("on Thursday.") sound halting, because every line is a separate voice clip with its own small pause.
- **Describe what's happening as it happens.** A line plays while its step plays. A line that runs ahead of the screen ("I save it and open settings" while the cursor still hovers Save) is the most common complaint. If one sentence spans two actions, split it at the comma between them.
- **Are true.** Check every claim against the code: intervals, limits, what happens on failure. A demo that overstates is worse than one that's vague.
- **Name only what's visible.** Don't say "the dashboard shows your history" unless the history is on screen when the line plays.
- **End on a warm closing line** in the project's own voice, over the final screen: "That's search in Notebloom." "Happy growing." Viewers remember the last line; a flat ending ("and that's the end of the demo") wastes it.

### Sign-off before filming

Nothing is filmed until the user has signed off the storyboard. Finding out after five recorded shots that they wanted a different story wastes their time and money; a reword on paper costs nothing.

1. **Save the full storyboard** to a file the user can read (for example `demos/storyboard.md`). It contains every shot in order, each with its steps and the exact line spoken during each step, the starting state, its approximate length, and its recommended model and the reason. Summarize it in your reply and point to the file.
2. **Ask for an explicit go.** Ask the user to approve it or say what to change: the wording, the shots, the order, the length, the closing line, the models. If they ask for changes, revise the file and show it again. Keep going until they clearly approve.
3. **Record nothing before that.** No test takes, no shots "to see how it looks". You may open and click through the app to plan the storyboard; that isn't filming.
4. **Changes after sign-off go back to the user.** Suppose a shot agent proposes rewording a line, or a step turns out not to work as planned, so the shot gains, loses or changes steps. Show the user the change and get their OK before filming that shot. Small technical fixes that don't change what's seen or said (a locator, a wait, a zoom level) don't need sign-off.

The one exception: the user explicitly says, in so many words, to skip the review ("don't wait for me to approve the script, just record it"). A general wish for speed ("make it quick", "just do it") isn't that; ask. When the review is skipped, still save the storyboard file, and present it alongside the finished video so the user can see what was planned.

## 2. Setup

Copy the bundled files into the project. From this skill's directory:

| Skill file | Goes to |
| --- | --- |
| `scripts/demo-recorder.ts` | `demos/lib/demo-recorder.ts` |
| `scripts/demo-session.ts` | `demos/lib/demo-session.ts` |
| `scripts/narration.mjs` | `demos/narration.mjs` |
| `scripts/signin.mjs` | `demos/signin.mjs` (only if the app needs sign-in) |
| `assets/playwright.demo.config.ts` | `demos/playwright.demo.config.ts` |
| `assets/shot.spec.ts`, `assets/shot.narration.json` | templates for each shot in `demos/shots/<demo>/` |

Then:

- Add `artifacts/` (or at least `artifacts/demo/` and `artifacts/demo-results/`) to `.gitignore`. Recordings and browser profiles must never be committed: profiles hold live sessions.
- If the project has no `@playwright/test`, install it as a dev dependency (`npm i -D @playwright/test`, then `npx playwright install chromium`). If its own Playwright config would pick up `demos/`, exclude that folder there.
- Run `node demos/narration.mjs check`. It needs ffmpeg and ffprobe (on PATH, or FFMPEG_DIR pointing at their bin folder) and `uvx` from uv, which runs edge-tts without installing it. If something's missing, tell the user the install command for their OS. On Windows, winget puts ffmpeg under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\...\bin`, often not on PATH in an existing shell.
- If the project's dev server watches files, make it ignore `artifacts/`: live Chrome profiles lock files there and can crash the watcher.

**Sign-in.** If a shot needs a signed-in app, run `node demos/signin.mjs <profile> <login urls...>` and ask the user to sign in in the window that opens, then close it. Never type a user's password yourself, even if they offer it. Signing in by hand also gets past captchas, which fail under automation. Use one profile per person the demo shows ("owner", "customer"). Pass the profile to `openDemoSession(NAME, test.info(), {profile: "owner"})`. If the app needs no sign-in, leave `profile` out and every shot starts from a clean browser.

**Use demo data.** Record against a fresh, throwaway account or database seeded with believable sample data, never a real user's. If a personal detail still shows (the account owner's name in a header), list it in `DEMO_REDACT` with a stand-in, which reads more naturally than a gap: `DEMO_REDACT="Jane Doe=Demo User,jane@example.com=demo@example.com,JD=DU"`. A bare entry (`Jane Doe`) blanks it instead. Check the first frames of every new screen for leaks: a name in a footer is easy to miss.

**Size the page to the frame.** The default 125% text zoom suits full-width apps. If the app is a narrow column that leaves most of the 1080p frame empty, raise `zoom` (1.5 to 1.75) so the content fills more of it and stays readable on a phone.

## 3. Write, record and review each shot

Name shots `<demo>/<NN-slug>`, e.g. `portfolio/02-add-task`. The spec and its narration sit together at `demos/shots/portfolio/02-add-task.spec.ts` and `.narration.json`, and the shot is recorded, mixed and stitched under that name.

Start from `assets/shot.spec.ts`. The recorder's API (all methods are on `demo`):

| Call | Use |
| --- | --- |
| `markStart()` / `markEnd()` | Trim the blank first frames and the closing browser. Call `markStart` once the first screen has drawn. |
| `restoreCursor()` | Redraw the cursor after a navigation replaced the page. |
| `narrate(key)` | Start a line. It first waits for the previous line to finish, so lines never overlap. |
| `waitForSpeech()` | Wait for the current line to finish, e.g. before leaving the screen it describes. |
| `click(locator)`, `type(locator, text)` | Glide the cursor there and act, at human speed, with a click ripple. |
| `hover(locator, ms)` | Point at what the line talks about. It never fails a take: a missing target just holds still. |
| `pause(ms)`, `scrollTo(locator)`, `scrollToTop()`, `scrollToBottom()` | Pacing and scrolling. |
| `cutStart()` / `cutEnd()` | Remove a stretch from the video: a slow load, a person solving a captcha. Let the line finish first, since speech inside a cut is cut too. |

Pacing rules that come from real reviews:

- **Keep the voice flowing.** Lines already have a short natural pause between them, so start the next line as soon as its step begins. Don't add `pause()` calls between `waitForSpeech()` and the next `narrate()`, and let actions happen during a line rather than waiting for silence before each click. Use `waitForSpeech()` only where the screen is about to change away from what the line describes.
- **No silent stretches over about 2 seconds.** If navigating takes a while, give it a line ("To find it, I open Settings, then Billing."), or cut the wait.
- **The cursor should move with the voice.** While a line describes something, hover it. A parked cursor on a static screen for a 7-second line reads as frozen.
- **No stray or repeated clicks.** Wait for the page to be ready before clicking (a visible, enabled target), and never click something "just in case". A redundant click is visible in the recording.
- **Show real actions.** If the store already has the thing a shot creates, remove it first (off camera) so the shot can create it. Pre-existing state makes the video skip the step it claims to show.
- **Finish lines on the screen they describe** (`waitForSpeech()` before navigating away).

Then, for each shot:

```bash
node demos/narration.mjs prepare <name>              # voice the lines (re-run after editing them)
npx playwright test -c demos/playwright.demo.config.ts <demo>/<NN-slug>
node demos/narration.mjs mix <name> --subtitles
node demos/narration.mjs sheet <name>
```

Prepare before recording: the spec times its pauses from the voice clips' lengths. Without them, nothing waits for speech and the lines will pile up in the mix.

**Review every take yourself before showing it.** Look at the contact sheet (`artifacts/demo/<name>.sheet.png`) and the last frame. Check:

- each subtitle sits over the screen it describes
- the cursor is moving or pointing during each line
- no blank, loading or error frames are left uncut
- no personal data is visible

Fix the spec and retake rather than explaining a flaw away. Then send the user the MP4, say in a sentence or two what it shows, and point out anything you're unsure about.

**Reset between takes.** A take changes the app (it created a task, linked an account, deleted something). Before a retake, put things back the way the shot expects, off camera, with a small script in the same style or with the user's help. Write the reset down in the spec's header comment. For a step that can't be redone easily (deleting an account, uninstalling), keep `finish()` in a `finally` as the template does, so a failed check after the step still saves the footage.

### Delegating shots

Once setup is done, give each shot to a subagent on the model chosen for it (the Agent tool's `model` parameter; for the session's model, leave it unset). The agent can't see this conversation, so its brief must carry everything it needs. Fill in `references/shot-brief.md` for each shot and pass it as the prompt. It asks for:

- the shot's name, its storyboard entry with every step and approved line verbatim, and the starting state
- the project path, the app URL and how to start it, the profile and DEMO_REDACT to use, and FFMPEG_DIR if it's needed
- what the shot leaves behind, and how to reset it for a retake

The brief tells the agent to:
- read `references/shot-agent.md`, which carries the recorder API, the pacing rules and the review checklist
- record and self-review the shot
- report back the files, the contact sheet's path, anything it couldn't fix, and any wording it would change

The agent doesn't change approved narration or steps; it proposes changes, and you take them to the user (see "Sign-off before filming").

**What can run in parallel.** Run shots in parallel only when they can't affect each other:

- **In storyboard order, one at a time:** shots that share app state, where one starts from what the previous left.
- **One at a time:** shots that use the same signed-in profile, because Chrome locks a profile to one browser.
- **One at a time, with the user told first:** shots that need a person, for a captcha or a sign-in prompt. Ask them to watch the recording window.
- **In parallel:** everything else, for example independent shots in a fresh browser against a read-only app. Give each its own app instance and port if it starts one.

When a report comes back, look at its contact sheet yourself before accepting the shot. You're the one who answers to the user for the video. If it needs another take, send the agent back with specific notes, using SendMessage to keep its context. After two failed attempts on the same problem, follow "Recommending a model for each shot": tell the user, recommend the next model up, and brief a fresh agent on their choice with both reports.

## 4. Stitch and deliver

Once every shot is approved:

```bash
node demos/narration.mjs stitch artifacts/demo/<demo>.mp4 <demo>/01-intro <demo>/02-add-task ...
```

Every shot must be mixed with the same options, all `--subtitles` or none. The output is 1920×1080, 30 fps, H.264 with AAC audio. That suits YouTube, app stores and most portfolio sites.

Tell the user:

- the file's path and length
- anything left to them: uploading, setting a video unlisted, re-signing in later
- what state the app was left in

Offer to commit the `demos/` folder (never `artifacts/`), so future versions of the demo can be re-recorded with one command per shot.

## When things go wrong

Read `references/pitfalls.md` when a take fails or looks off. It covers iframes, code editors under zoom, network-idle waits that never end, captchas and OAuth screens, avatars and shadow DOM, time-sensitive app state, audio drift, and more, each with the fix that worked.
