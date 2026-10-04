#!/usr/bin/env node
// SessionStart hook: after startup or /clear in a Spec Kit repo, tell Claude where work left off.
// Prints nothing (and adds no context) outside a repo with a specs/ folder, or when the
// repo's origin isn't owned by an allowed GitHub account.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The hook copies tasks.md and state.md text into Claude's context, so it only runs in
// repos whose origin is one of these GitHub owners. Override with SPEC_RESUME_OWNERS=a,b.
const OWNERS = (process.env.SPEC_RESUME_OWNERS ?? "jkhaynes").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const MAX_OPEN_TASKS = 12;
const TASK_CHARS = 140;
const STATE_LINE_CHARS = 240;

function run(cmd, args, cwd, timeout = 3000) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// github.com:owner/repo(.git) or https://github.com/owner/repo(.git) -> "owner"
export function originOwner(url) {
  return url?.match(/github\.com[:/]+([^/]+)\/[^/]+?(?:\.git)?\/?$/i)?.[1].toLowerCase() ?? null;
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

// A specs/ folder named after the branch (or sharing its NNN- prefix) wins over
// .specify/feature.json, which still points at the last feature after switching branches.
function findFeature(root, branch) {
  const specs = join(root, "specs");
  const leaf = branch.split("/").pop();
  const dirs = readdirSync(specs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const prefix = leaf.match(/^(\d{3,})-/)?.[1];
  const dir = dirs.find((d) => d === leaf) ?? (prefix && dirs.find((d) => d.startsWith(prefix + "-")));
  if (dir) return { dir: `specs/${dir}`, from: "branch name" };
  try {
    const fromJson = JSON.parse(readFileSync(join(root, ".specify", "feature.json"), "utf8")).feature_directory;
    if (fromJson && existsSync(join(root, fromJson))) return { dir: fromJson.split("\\").join("/"), from: ".specify/feature.json; the branch name matches no spec" };
  } catch {}
  return null;
}

// Same section rules as skills/phase-done/scripts/phase-tasks.mjs: "## " headings that hold tasks.
function phases(text) {
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(?!#)(.*)$/);
    if (h) {
      cur = { title: h[1].trim(), tasks: [] };
      out.push(cur);
      continue;
    }
    const t = cur && line.match(/^\s*[-*]\s+\[([ xX])\]\s+(T\d+)\b(.*)$/);
    if (t) cur.tasks.push({ id: t[2], done: t[1] !== " ", text: t[3].trim() });
  }
  return out.filter((p) => p.tasks.length);
}

function stateSections(root) {
  const path = join(root, "docs", "state.md");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const out = [];
  for (const name of ["Current Focus", "Next Up", "Blockers / Open Questions"]) {
    const m = text.match(new RegExp(`^##\\s+${name.replace(/[/]/g, "\\/")}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "m"));
    const body = m?.[1].trim();
    if (body && !/^_?none_?\.?$/i.test(body)) out.push(`${name}:\n${body.split(/\r?\n/).slice(0, 6).map((l) => "  " + (l.length > STATE_LINE_CHARS ? l.slice(0, STATE_LINE_CHARS - 1) + "…" : l)).join("\n")}`);
  }
  return out;
}

function main() {
  const input = readStdin();
  const cwd = input.cwd || process.cwd();
  const root = run("git", ["rev-parse", "--show-toplevel"], cwd);
  if (!root || !existsSync(join(root, "specs"))) return;
  // Checked before git status, which can run commands from the repo's own .git/config.
  const owner = originOwner(run("git", ["config", "--get", "remote.origin.url"], root));
  if (!owner || !OWNERS.includes(owner)) return;

  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], root) ?? "?";
  const lines = [`Spec Kit resume (from the spec-resume hook, ${input.source ?? "startup"}):`];

  const dirty = run("git", ["status", "--porcelain"], root);
  const upstream = run("git", ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], root);
  let gitLine = `Branch: ${branch}`;
  if (dirty !== null) gitLine += dirty ? `, ${dirty.split("\n").length} uncommitted file(s)` : ", clean";
  if (upstream) {
    const [behind, ahead] = upstream.split(/\s+/).map(Number);
    if (ahead) gitLine += `, ${ahead} unpushed commit(s)`;
    if (behind) gitLine += `, ${behind} behind upstream`;
  } else if (branch !== "HEAD") gitLine += ", no upstream";
  lines.push(gitLine);

  const found = findFeature(root, branch);
  const feature = found?.dir;
  const tasksPath = feature && join(root, feature, "tasks.md");
  if (!feature) lines.push("Feature: none matched this branch under specs/.");
  else if (!existsSync(tasksPath)) lines.push(`Feature: ${feature} (no tasks.md yet)`);
  else {
    const all = phases(readFileSync(tasksPath, "utf8"));
    const doneCount = all.reduce((n, p) => n + p.tasks.filter((t) => t.done).length, 0);
    const total = all.reduce((n, p) => n + p.tasks.length, 0);
    lines.push(`Feature: ${feature}, from ${found.from} (${doneCount}/${total} tasks done across ${all.length} phases)`);
    const idx = all.findIndex((p) => p.tasks.some((t) => !t.done));
    if (idx === -1) lines.push("All phases in tasks.md are checked off.");
    else {
      const p = all[idx];
      const open = p.tasks.filter((t) => !t.done);
      lines.push(`Current phase: ${p.title} (${p.tasks.length - open.length}/${p.tasks.length} done)`);
      lines.push("Unchecked tasks:");
      for (const t of open.slice(0, MAX_OPEN_TASKS)) {
        const text = t.text.length > TASK_CHARS ? t.text.slice(0, TASK_CHARS - 1) + "…" : t.text;
        lines.push(`  - ${t.id} ${text}`);
      }
      if (open.length > MAX_OPEN_TASKS) lines.push(`  … and ${open.length - MAX_OPEN_TASKS} more`);
      if (all[idx + 1]) lines.push(`After that: ${all[idx + 1].title}`);
    }
    lines.push("To read one phase without loading all of tasks.md, use the phase-done skill's scripts/phase-tasks.mjs (show <phase>).");
  }

  const prs = run("gh", ["pr", "list", "--state", "open", "--json", "number,title,headRefName,url", "--limit", "10"], root, 5000);
  if (prs) {
    try {
      const list = JSON.parse(prs);
      const mine = list.filter((pr) => pr.headRefName === branch);
      for (const pr of mine) lines.push(`Open PR for this branch: #${pr.number} ${pr.title} ${pr.url}`);
      const others = list.length - mine.length;
      if (others) lines.push(`Other open PRs in this repo: ${list.filter((pr) => pr.headRefName !== branch).map((pr) => `#${pr.number} (${pr.headRefName})`).join(", ")}`);
    } catch {}
  }

  lines.push(...stateSections(root));

  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") } }));
}

main();
