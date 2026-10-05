# Recording a shot

You've been given one shot of a narrated demo video to record. The storyboard and narration are settled; your job is to make the recording match them: the right thing on screen, with the cursor on it, while each line is spoken. The person who briefed you reviews your contact sheet before accepting the shot, so review it honestly yourself first.

The project already has the tooling in `demos/`:

- `demos/lib/demo-session.ts` and `demos/lib/demo-recorder.ts`
- `demos/narration.mjs`
- `demos/playwright.demo.config.ts`

Run every command from the project root.

## 1. Write the narration file and the spec

`demos/shots/<demo>/<NN-slug>.narration.json` has one entry per line, with each approved line copied verbatim:

```json
{ "intro": { "say": "This is Fernlist, a cozy to-do list for keeping plants happy." } }
```

Copy the spec from `assets/shot.spec.ts` in the skill folder, or from an existing shot, to `demos/shots/<demo>/<NN-slug>.spec.ts`. Set `NAME` to the shot name and pass the session options from your brief.

Find locators by role and accessible name (`getByRole("button", {name: "Add"})`). Read the app's HTML or components when unsure, and prefer `exact: true` when a name could match two things.

The recorder (`demo`):

| Call | Use |
| --- | --- |
| `markStart()` / `markEnd()` | Trim before the first drawn screen, and after the last line. |
| `restoreCursor()` | Redraw the cursor after a navigation. |
| `narrate(key)` | Start a line. It waits for the previous line first, so lines never overlap. |
| `waitForSpeech()` | Wait for the current line to end, before the screen changes away from what it describes. |
| `click(loc)`, `type(loc, text)` | Glide the cursor there and act at human speed. |
| `hover(loc, ms)` | Point at what the line is about. It never fails the take. |
| `pause(ms)`, `scrollTo(loc)`, `scrollToTop()`, `scrollToBottom()` | Pacing and scrolling. |
| `cutStart()` / `cutEnd()` | Remove a slow stretch (a loading spinner, a captcha) from the video. Let the line finish first. |

Pacing, which is what reviewers notice:

- Start each line as its step begins, and let actions happen while it plays. Don't put `pause()` between `waitForSpeech()` and the next `narrate()`: lines already have a natural gap.
- Keep the cursor busy. While a line describes something, hover it. Nothing should sit still and silent for more than about 2 seconds; cut waits you can't fill.
- Click only what the step needs, once, after the target is visible. A redundant click shows on camera.
- Bound network waits: `await page.waitForLoadState("networkidle", {timeout: 10_000}).catch(() => undefined)`.
- Keep `finish()` in the template's `finally`.

## 2. Record and mix

```bash
node demos/narration.mjs prepare <name>
npx playwright test -c demos/playwright.demo.config.ts <demo>/<NN-slug>
node demos/narration.mjs mix <name> --subtitles
node demos/narration.mjs sheet <name>
```

Run `prepare` first, and again after any change to the narration file. The spec times its waits from the clips.

If the brief says a person will solve a captcha, print a clear console message just before it, and wait with a long timeout.

## 3. Review the take

Open `artifacts/demo/<name>.sheet.png`, a frame every 1.5 seconds with the subtitles burned in. Also check the last frame (`ffmpeg -sseof -1 -i artifacts/demo/<name>.mp4 -frames:v 1 last.png`). Go through this list:

- Each subtitle sits over the screen it describes. No line is spoken over a screen it doesn't match.
- The cursor is on or moving to the thing each line talks about.
- There are no blank, half-drawn, loading or error frames, and no silent stretch with nothing happening.
- No personal data is visible: names, emails, avatars, keys.
- The first frame is clean, and the last frame is the shot's final screen, not black.

If anything fails, fix the spec, reset the app state as the brief says, and record again. Stop after three takes and report what's still wrong, rather than shipping a take you know is flawed.

## 4. Report

Reply with:

- the MP4 and contact-sheet paths, and the video's length
- what you checked
- anything still wrong
- any line you'd reword, quoted with your suggestion
- the state the app is left in
