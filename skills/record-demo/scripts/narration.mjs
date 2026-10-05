#!/usr/bin/env node
// Voiceover, subtitles and review sheets for screen-recorded demos. A shot's name is its spec path
// under the shots folder (demos/shots, or DEMO_SHOTS_DIR) without `.spec.ts`, e.g. `portfolio/01-intro`.
//
//   node demos/narration.mjs check
//     Confirms ffmpeg, ffprobe and uvx can run.
//
//   node demos/narration.mjs prepare <name>
//     Voices each line in <name>.narration.json with a Microsoft neural voice (edge-tts, run through
//     uvx) and records each clip's length, which the spec waits on so lines never overlap. Only the
//     narration text leaves the machine.
//
//   node demos/narration.mjs mix <name> [--subtitles]
//     Lays each clip over the recorded video at the moment its line started (the cues the spec
//     wrote), trims and cuts it, and encodes artifacts/demo/<name>.mp4 at 1920x1080. --subtitles burns
//     in the full narration as subtitles, split into readable chunks timed across each clip.
//
//   node demos/narration.mjs sheet <name> [seconds]
//     Tiles a frame every few seconds (default 1.5) of the mixed video into
//     artifacts/demo/<name>.sheet.png, to review a take at a glance.
//
//   node demos/narration.mjs stitch <output.mp4> <name> <name> ...
//     Joins mixed shots, in order, into one video. Each must have been mixed with the same options.
//
// Needs uv and ffmpeg. FFMPEG_DIR points at ffmpeg's bin folder when it isn't on PATH; DEMO_VOICE
// picks another edge-tts voice (`uvx edge-tts --list-voices`); DEMO_OUT_DIR moves artifacts/demo.
import {spawnSync} from "node:child_process";
import console from "node:console";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import process from "node:process";

const [command, ...args] = process.argv.slice(2);
const usage = `usage:
  node demos/narration.mjs check
  node demos/narration.mjs prepare <name>
  node demos/narration.mjs mix <name> [--subtitles]
  node demos/narration.mjs sheet <name> [seconds]
  node demos/narration.mjs stitch <output.mp4> <name> <name> ...`;
if (
  !["check", "prepare", "mix", "sheet", "stitch"].includes(command) ||
  (command !== "check" && args.length === 0)
) {
  console.error(usage);
  process.exit(2);
}

const voice = process.env.DEMO_VOICE ?? "en-US-AvaNeural";
const bin = (tool) => (process.env.FFMPEG_DIR ? join(process.env.FFMPEG_DIR, tool) : tool);
// ffmpeg's filter syntax treats `\` and `:` specially, so paths handed to a filter stay relative
// and forward-slashed.
const filterPath = (path) => path.replaceAll("\\", "/");
const shotsDir = process.env.DEMO_SHOTS_DIR ?? join("demos", "shots");
const outDir = process.env.DEMO_OUT_DIR ?? join("artifacts", "demo");
const narrationDir = (name) => join(outDir, "narration", name);
const mixedVideo = (name) => join(outDir, `${name}.mp4`);

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, {encoding: "utf8"});
  if (result.error) throw new Error(`${cmd} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} failed:\n${result.stderr.slice(-2000)}`);
  return result.stdout;
}

const seconds = (file) =>
  Number(
    run(bin("ffprobe"), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]),
  );
const readLines = (name) =>
  JSON.parse(readFileSync(join(shotsDir, `${name}.narration.json`), "utf8"));

function prepare(name) {
  const dir = narrationDir(name);
  mkdirSync(dir, {recursive: true});
  const clips = {};
  for (const [key, {say}] of Object.entries(readLines(name))) {
    const file = join(dir, `${key}.mp3`);
    run("uvx", ["edge-tts", "--voice", voice, "--text", say, "--write-media", file]);
    clips[key] = Math.round(seconds(file) * 1000);
    console.log(`${key}: ${(clips[key] / 1000).toFixed(1)}s`);
  }
  writeFileSync(join(dir, "clips.json"), JSON.stringify(clips, null, 2));
}

/** Splits a narration line into subtitle chunks of at most `max` characters, at sentence breaks first. */
function chunk(text, max = 84) {
  const out = [];
  for (const sentence of text.match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g) ?? [text]) {
    let rest = sentence.trim();
    while (rest.length > max) {
      const window = rest.slice(0, max);
      const comma = window.lastIndexOf(", ");
      const cut = comma > max / 3 ? comma + 1 : window.lastIndexOf(" ");
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

const assTime = (ms) => {
  const cs = Math.round(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

function writeSubtitles(name, cues, width, height) {
  const lines = readLines(name);
  const clips = JSON.parse(readFileSync(join(narrationDir(name), "clips.json"), "utf8"));
  const events = [];
  for (const {key, atMs} of cues) {
    const pieces = chunk(lines[key].say);
    const total = pieces.reduce((sum, p) => sum + p.length, 0);
    let start = atMs;
    for (const piece of pieces) {
      const end = start + (clips[key] * piece.length) / total;
      events.push(
        `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${piece.replaceAll("\n", " ")}`,
      );
      start = end;
    }
  }
  const size = Math.round(height * 0.042);
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Segoe UI,${size},&H00FFFFFF,&H00FFFFFF,&H40201A1B,&H40201A1B,0,0,0,0,100,100,0,0,3,${Math.round(size * 0.35)},0,2,${Math.round(width * 0.1)},${Math.round(width * 0.1)},${Math.round(height * 0.05)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
  const file = join(narrationDir(name), "subtitles.ass");
  writeFileSync(file, ass);
  return file;
}

function mix(name, withSubtitles) {
  const dir = narrationDir(name);
  // cues.json is a bare list of cues, or {startMs, endMs, cuts, cues}: the marks trim the video's
  // ends, and each cut removes a stretch in between, everything after it moving up to close the gap.
  const recorded = JSON.parse(readFileSync(join(dir, "cues.json"), "utf8"));
  const {startMs = 0, endMs, cuts: rawCuts = []} = Array.isArray(recorded) ? {} : recorded;
  const cuts = rawCuts.map(({fromMs, toMs}) => ({from: fromMs - startMs, to: toMs - startMs}));
  const cutBefore = (t) =>
    cuts.reduce((sum, c) => sum + (t >= c.to ? c.to - c.from : t > c.from ? t - c.from : 0), 0);
  const cues = (Array.isArray(recorded) ? recorded : recorded.cues).map((cue) => {
    const t = Math.max(0, cue.atMs - startMs);
    return {...cue, atMs: Math.round(t - cutBefore(t))};
  });
  const keptMs = endMs ? endMs - startMs - cutBefore(endMs - startMs) : undefined;
  const keep = keptMs ? ["-t", String(keptMs / 1000)] : [];
  const inputSpan = endMs ? ["-t", String((endMs - startMs) / 1000)] : [];
  const video = join(dir, "video.webm");
  if (!existsSync(video)) throw new Error(`no recorded video for ${name}: record the shot first`);

  const inputs = ["-ss", String(startMs / 1000), ...inputSpan, "-i", video];
  const filters = cues.map(({key, atMs}, i) => {
    inputs.push("-i", join(dir, `${key}.mp3`));
    return `[${i + 1}:a]adelay=${atMs}|${atMs}[a${i}]`;
  });
  filters.push(
    `${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0:duration=longest,apad[voice]`,
  );
  // A constant frame rate first, so dropping a cut's frames and renumbering the rest keeps time.
  const dropCuts = cuts.length
    ? `,select='not(${cuts.map((c) => `between(t,${c.from / 1000},${c.to / 1000})`).join("+")})',setpts=N/30/TB`
    : "";
  // Every demo comes out 1920×1080: shots recorded at a smaller viewport (no CSS zoom) scale up.
  filters.push(`[0:v]fps=30${dropCuts},scale=1920:1080:flags=lanczos[base]`);
  let videoOut = "[base]";
  if (withSubtitles) {
    filters.push(`[base]subtitles=${filterPath(writeSubtitles(name, cues, 1920, 1080))}[v]`);
    videoOut = "[v]";
  }
  const out = mixedVideo(name);
  mkdirSync(dirname(out), {recursive: true});
  run(bin("ffmpeg"), [
    "-y",
    "-v",
    "error",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    videoOut,
    "-map",
    "[voice]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    // The voice is padded with silence and cut at the video's end. Unpadded, it stopped with the last
    // line, and stitching then started each later demo's voice early by the gap.
    "-shortest",
    ...keep,
    out,
  ]);
  console.log(`${out}: ${seconds(out).toFixed(1)}s, ${cues.length} narration lines`);
}

function stitch(output, names) {
  const list = join(outDir, "stitch-list.txt");
  // The concat demuxer resolves entries relative to the list file, which sits beside the videos.
  writeFileSync(list, names.map((n) => `file '${filterPath(`${n}.mp4`)}'`).join("\n"));
  for (const n of names)
    if (!existsSync(mixedVideo(n))) throw new Error(`${mixedVideo(n)} is missing: mix it first`);
  run(bin("ffmpeg"), [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    output,
  ]);
  console.log(`${output}: ${seconds(output).toFixed(1)}s from ${names.length} demos`);
}

function check() {
  for (const [tool, toolArgs] of [
    [bin("ffmpeg"), ["-version"]],
    [bin("ffprobe"), ["-version"]],
    ["uvx", ["--version"]],
  ]) {
    const result = spawnSync(tool, toolArgs, {encoding: "utf8"});
    const ok = !result.error && result.status === 0;
    console.log(`${ok ? "ok     " : "MISSING"} ${tool}`);
    if (!ok) process.exitCode = 1;
  }
  if (process.exitCode)
    console.log(
      "Install ffmpeg (winget install Gyan.FFmpeg, brew install ffmpeg, apt install ffmpeg) and uv (https://docs.astral.sh/uv/). If ffmpeg is installed but not on PATH, set FFMPEG_DIR to its bin folder.",
    );
}

function sheet(name, every = 1.5) {
  const video = mixedVideo(name);
  if (!existsSync(video)) throw new Error(`${video} is missing: mix it first`);
  const frames = Math.ceil(seconds(video) / every);
  const columns = 6;
  const rows = Math.max(1, Math.ceil(frames / columns));
  const out = join(outDir, `${name}.sheet.png`);
  run(bin("ffmpeg"), [
    "-y",
    "-v",
    "error",
    "-i",
    video,
    "-vf",
    `fps=1/${every},scale=400:-1,tile=${columns}x${rows}`,
    "-frames:v",
    "1",
    out,
  ]);
  console.log(`${out}: ${frames} frames, one every ${every}s, read left to right`);
}

if (command === "check") check();
if (command === "sheet") sheet(args[0], args[1] ? Number(args[1]) : undefined);
if (command === "prepare") prepare(args[0]);
if (command === "mix") mix(args[0], args.includes("--subtitles"));
if (command === "stitch") stitch(args[0], args.slice(1));
