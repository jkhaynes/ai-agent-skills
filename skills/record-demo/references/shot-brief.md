# Shot brief template

Fill this in for each shot and pass it as the subagent's prompt, on the model chosen for that shot. Replace every `<...>`, and delete lines that don't apply. Be literal: the agent has none of your conversation, only this.

```
You're recording one shot of a narrated demo video. Work only inside the project folder below,
and don't ask questions: decide sensibly and say what you decided in your report.

First read <skill dir>/references/shot-agent.md. It explains the tools, the pacing rules and how to
review your take. Read <skill dir>/references/pitfalls.md if a take fails or looks wrong.

Project: <absolute project path>
App: <URL>. <"It's already running." | "Start it with `<command>` (it reads PORT; use <port>), in the
background, and stop it when you're done.">
Shot name: <demo>/<NN-slug>  (spec: demos/shots/<demo>/<NN-slug>.spec.ts, narration beside it)
Session options: <none | {profile: "<name>"} | {zoom: 1.6} | {cssZoom: false}>
Environment: <FFMPEG_DIR=<path>> <DEMO_REDACT="<real=stand-in,...>">
Starts from: <exact state on screen and in the data when the shot begins>
Leaves behind: <what the shot changes>. To reset for a retake: <steps or script>.
<Needs a person: "Discord shows a captcha after Authorize; the user has been told to solve it in the
recording window." | (delete)>

Storyboard for this shot (narration is approved: use these lines verbatim, one narration key per line):
  <key>: <step on screen>  ->  "<line>"
  <key>: <step on screen>  ->  "<line>"
  ...

Finish when the mixed video and its contact sheet pass your review, or after three takes. Report:
- the paths of artifacts/demo/<name>.mp4 and <name>.sheet.png, and the video's length
- what you checked on the contact sheet, and anything still wrong
- any line you'd reword (quote it and your suggestion); don't change the narration file yourself
- the state the app is left in
```
