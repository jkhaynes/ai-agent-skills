#!/usr/bin/env node
// Read and update one phase of a Spec Kit tasks.md without loading the whole file.
//
//   node phase-tasks.mjs status                 phases with done/total; marks the current one
//   node phase-tasks.mjs show [PHASE]           print one phase section (default: current)
//   node phase-tasks.mjs changed                tasks checked or unchecked since HEAD, by phase
//   node phase-tasks.mjs check T012 T013 ...    mark tasks done, in the file's own [X]/[x] style
//
// Options: --file <tasks.md>  --feature <specs/NNN-name>
//
// PHASE is a phase number ("3"), a heading fragment ("8 follow-up", "Polish"),
// "current" (first phase with an unchecked task), "next" (the one after current)
// or "last-done" (the last phase whose tasks are all checked).
//
// The feature is found from --file, --feature, a specs/ folder named after the
// branch or sharing its NNN- prefix, and finally .specify/feature.json.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TASK = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(T\d+)\b(.*)$/;
const HEADING = /^##\s+(?!#)(.*)$/;

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function fail(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
}

export function findTasksFile({ file, feature, cwd = process.cwd() } = {}) {
  if (file) return resolve(cwd, file);
  const root = git(["rev-parse", "--show-toplevel"], cwd) ?? cwd;
  if (feature) return resolve(root, feature, "tasks.md");

  const specs = join(root, "specs");
  if (!existsSync(specs)) return null;
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root) ?? "";
  const leaf = branch.split("/").pop();
  const dirs = readdirSync(specs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const exact = dirs.find((d) => d === leaf);
  const prefix = leaf.match(/^(\d{3,})-/)?.[1];
  const byPrefix = prefix && dirs.find((d) => d.startsWith(prefix + "-"));
  const dir = exact ?? byPrefix;
  if (dir && existsSync(join(specs, dir, "tasks.md"))) return join(specs, dir, "tasks.md");

  // feature.json keeps pointing at the last feature after a branch switch, so it only breaks ties.
  const featureJson = join(root, ".specify", "feature.json");
  if (existsSync(featureJson)) {
    try {
      const dir = JSON.parse(readFileSync(featureJson, "utf8")).feature_directory;
      if (dir && existsSync(join(root, dir, "tasks.md"))) return join(root, dir, "tasks.md");
    } catch {}
  }
  return null;
}

// Split tasks.md into "## " sections. Only sections holding at least one task count as phases.
export function parsePhases(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;
  lines.forEach((line, i) => {
    const h = line.match(HEADING);
    if (h) {
      current = { title: h[1].trim(), start: i, end: lines.length, tasks: [] };
      if (sections.length) sections[sections.length - 1].end = i;
      sections.push(current);
      return;
    }
    const t = current && line.match(TASK);
    if (t) current.tasks.push({ id: t[4], done: t[2] !== " ", line: i, text: t[5].trim() });
  });
  const phases = sections.filter((s) => s.tasks.length);
  phases.forEach((p, i) => {
    p.index = i;
    p.number = p.title.match(/^Phase\s+(\d+)/i)?.[1] ?? null;
  });
  return { lines, phases };
}

export function pickPhase(phases, query = "current") {
  const currentIdx = phases.findIndex((p) => p.tasks.some((t) => !t.done));
  const q = String(query).trim().toLowerCase();
  if (q === "current") return currentIdx === -1 ? null : phases[currentIdx];
  if (q === "next") return currentIdx === -1 ? null : phases[currentIdx + 1] ?? null;
  if (q === "last-done") {
    const done = phases.filter((p) => p.tasks.every((t) => t.done));
    return done[done.length - 1] ?? null;
  }
  if (/^\d+$/.test(q)) {
    // "8" means the "Phase 8:" heading, not "Phase 8 follow-up: ...".
    return phases.find((p) => new RegExp(`^phase\\s+${q}\\s*:`, "i").test(p.title)) ?? phases.find((p) => p.number === q) ?? null;
  }
  return phases.find((p) => p.title.toLowerCase().includes(q)) ?? null;
}

function summary(p) {
  const done = p.tasks.filter((t) => t.done).length;
  return `${p.title}  [${done}/${p.tasks.length}]`;
}

function main(argv) {
  const opts = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") opts.file = argv[++i];
    else if (argv[i] === "--feature") opts.feature = argv[++i];
    else args.push(argv[i]);
  }
  const [command = "status", ...rest] = args;

  const path = findTasksFile(opts);
  if (!path || !existsSync(path)) fail("No tasks.md found. Pass --file <path> or --feature <specs/NNN-name>.");
  const raw = readFileSync(path, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const { lines, phases } = parsePhases(raw);
  const shown = relative(process.cwd(), path) || path;
  if (!phases.length) fail(`${shown} has no "## " sections with tasks.`);

  if (command === "status") {
    const cur = pickPhase(phases, "current");
    console.log(`tasks: ${shown}`);
    for (const p of phases) console.log(`${p === cur ? "->" : "  "} ${summary(p)}`);
    if (!cur) console.log("All phases complete.");
    return;
  }

  if (command === "show") {
    const query = rest.join(" ") || "current";
    const p = pickPhase(phases, query);
    if (!p) fail(`No phase matches "${query}". Run "status" to list phases.`);
    console.log(`<!-- ${shown} lines ${p.start + 1}-${p.end} -->`);
    console.log(lines.slice(p.start, p.end).join("\n").trimEnd());
    return;
  }

  if (command === "changed") {
    const root = git(["rev-parse", "--show-toplevel"]) ?? process.cwd();
    const rel = relative(root, path).split("\\").join("/");
    const before = git(["show", `HEAD:${rel}`], root);
    if (before === null) fail(`${rel} is not in HEAD; every task is new.`);
    const was = new Map();
    for (const p of parsePhases(before).phases) for (const t of p.tasks) was.set(t.id, t.done);
    let any = false;
    for (const p of phases) {
      const moved = p.tasks.filter((t) => was.has(t.id) ? was.get(t.id) !== t.done : t.done);
      if (!moved.length) continue;
      any = true;
      console.log(summary(p));
      for (const t of moved) console.log(`  ${t.done ? "checked  " : "unchecked"} ${t.id} ${t.text.slice(0, 100)}`);
    }
    if (!any) console.log("No task checkboxes changed since HEAD.");
    return;
  }

  if (command === "check") {
    const ids = rest.flatMap((a) => a.split(",")).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!ids.length) fail("Usage: check T001 T002 ...");
    const all = phases.flatMap((p) => p.tasks);
    // Match the file's existing style: Spec Kit writes [X], some files use [x].
    const mark = all.some((t) => t.done) && !raw.match(/^\s*[-*]\s+\[X\]/m) ? "x" : "X";
    for (const id of ids) {
      const t = all.find((task) => task.id === id);
      if (!t) console.log(`not found  ${id}`);
      else if (t.done) console.log(`already    ${id}`);
      else {
        lines[t.line] = lines[t.line].replace(TASK, (_, a, _box, b, tid, tail) => `${a}${mark}${b}${tid}${tail}`);
        t.done = true;
        console.log(`checked    ${id}`);
      }
    }
    writeFileSync(path, lines.join(eol));
    return;
  }

  fail(`Unknown command "${command}". Use status, show, changed or check.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2));
}
