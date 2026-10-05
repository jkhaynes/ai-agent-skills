# Pitfalls and fixes

Problems met while recording real demos, and what fixed them. Skim the headings and read the one that matches what you're seeing.

## The take hangs, then fails at the test timeout

- **`waitForLoadState("networkidle")` never settles.** Apps that poll, stream or hold a websocket never go network-idle. Always bound it: `await page.waitForLoadState("networkidle", {timeout: 10_000}).catch(() => undefined)`, and wait on a visible element for the real readiness signal.
- **A locator never matches.** `moveTo` (behind click, type and hover) waits up to 30 seconds for its target and then fails naming it, so a hang usually means the step before it never happened. Read the error-context snapshot Playwright writes under `artifacts/demo-results/` to see what the page actually showed.
- **`isEnabled()` or `isVisible()`-style checks on an element that doesn't exist yet wait for it.** Check `await locator.count() > 0` first when the element may legitimately be absent.
- **The person watching closes the window.** If the browser sits on one screen for a long time, they'll assume it's stuck. Tell them before a long take what to expect, and keep waits bounded.

## The video is missing, cut short, or a stale take got mixed

- A shot only saves its video when `finish()` runs and the browser context closes. If a check fails before `finish()`, the video is lost or truncated mid-recording. Keep `finish()` in a `finally`. `mix` then reports "no recorded video" or, worse, mixes the previous take still sitting in the folder. After a failed take, retake before mixing.
- Two Playwright runs in a row wipe `artifacts/demo-results/` (the raw output). The session moves each video to `artifacts/demo/narration/<name>/video.webm` as soon as it finishes, which is why it survives.

## Voice and picture drift apart in the stitched video

- Each mixed shot must have audio exactly as long as its video, or joining shots shifts every later line. `narration.mjs mix` pads the voice and cuts at the video's end. Confirm with ffprobe if a stitched video drifts: the audio and video stream durations should match to within a frame or two.
- Lines that overlap or crowd each other: the spec ran without voice clips. Run `prepare` before recording, and again after editing any line.

## The cursor or a click lands in the wrong place

- **Code editors (CodeMirror, Monaco) under CSS zoom** misplace clicks and may never take focus. Use `openDemoSession(NAME, info, {cssZoom: false})` for that shot: it records a 1536×864 viewport at 100% and the mix scales it to 1080p.
- **Iframes:** the cursor overlay lives in the top page only, which is intentional. Locate elements inside a frame with `page.frameLocator("iframe[name=...]")`. The recorder still moves the real mouse there.
- **Buttons outside their dialog:** component libraries often render a dialog's buttons in a portal or shadow root outside the dialog element, so `dialog.getByRole("button")` misses them. Pick the right one by position: the last match, or the visible one whose bounding box sits below the dialog's input.
- **Two identical buttons** (a page Save and a dialog Save): filter with `{visible: true}` and pick by position. Don't click both to be safe; the extra click shows.
- **Clicks ignored while a page builds itself:** some editors draw blank and drop clicks until an inner frame loads. Wait for that frame's body, and cut the wait.

## Something on screen shouldn't be

- **Floating widgets** (chat bubbles, AI assistants, cookie banners) cover the frame. Hide them with `hideCss`, scoped as narrowly as possible, since a broad selector can hide a field the demo needs.
- **Personal details:** `DEMO_REDACT="Jane Doe,jane@example.com,Jane D,JD"`. List longer strings before their prefixes. Initials of three characters or fewer are only blanked as a whole element's text, plus `[initials="JD"]` avatars, since a substring match on "JD" would eat other words. Text inside closed shadow roots can't be reached; hide the element with `hideCss` instead.
- **A sign-in under the wrong account** shows the wrong data or email for the whole run. Before the first shot, open the signed-in pages once and confirm who's signed in.

## Sign-in, captchas and third-party consent screens

- Don't automate a login with a password. The person signs in once with `signin.mjs`; the profile keeps the session.
- An OAuth or consent screen mid-shot (GitHub, Google, Discord) may show a captcha to an automated browser. Narrate the consent screen and hover what it asks for, click the approve button, then `demo.cutStart()`, ask the person (in the console and in chat) to solve the captcha in the recording window, wait for the redirect with a long timeout, and call `cutEnd()` once the app has drawn again. Test for leaving the provider by hostname (`new URL(page.url()).hostname`), not by URL text: the authorize URL contains your app's redirect URL.
- Consent screens that need scrolling ("Keep scrolling…") enable their button only after their list is scrolled. Scroll the list's scrollable ancestor to the bottom.
- Sessions expire. If a provider shows a login page mid-shot, stop and have the person re-run `signin.mjs`.

## The app's own behavior changes the take

- **Background checks and caches:** if the app re-validates on page visit after N minutes, a shot meant to show a manual refresh can find the work already done. Find the threshold in the code and record within it, or reset so the state is fresh.
- **Search indexes lag:** a record created a moment ago may not appear in a search-filtered list. Navigate to it directly, or wait.
- **Destructive steps** (delete, uninstall, cancel) can't be retaken without rebuilding the state. Explore those screens off camera first, cancelling at the last step, so the recorded take is right the first time. Expect confirmation dialogs that need a reason or a typed name before the button enables.
- **Success messages that appear twice** (a toast and a banner) break strict locators. Use `.first()`.

## Native controls

- **A `<select>` dropdown's open list never appears in the recording:** the browser draws it outside the page. Hover the select, then set it with `locator.selectOption(...)` or the keyboard (focus, then ArrowDown), so the viewer sees the cursor on the control and the new value appear. Narrate the choice, not the opening of the list.
- Date pickers, file dialogs and permission prompts are native too, and behave the same way. Set the value directly and show the result.

## Picture quality

- Record at 1920×1080 with text at 125% (the default). It reads well on phones and full screen.
- Burned-in subtitles cover roughly the bottom eighth of the frame. Keep what a line talks about above that: if a larger zoom pushes the content down into the subtitle band, lower the zoom or scroll the content up.
- Blank first frames and a black last frame come from not calling `markStart()` and `markEnd()`. If the first kept frame still shows a half-drawn page (a grey or unstyled flash), wait for the page's main content and add a short `pause()` (about 500 ms) before `markStart()`.
- The recording is compressed by the browser, so large areas that change at once (a list re-filtering) can blur for a frame. It's normal and settles immediately; it isn't a bug in the page.
- Long loading spinners: cut them (`cutStart()`/`cutEnd()`), leaving about a second so the change doesn't jump.
