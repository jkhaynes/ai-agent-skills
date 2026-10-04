#!/usr/bin/env node
// Gather everything /ship needs to know before asking for approval, in one read-only pass.
//
//   node ship-preflight.mjs           human-readable report
//   node ship-preflight.mjs --json    the same facts as JSON
//
// Runs git and gh only to read. Fetches origin so ahead/behind counts are current.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The `run:` steps of a workflow, job by job, each tagged with why it shouldn't run locally
// ("install", "deploy", "secrets", "services", "e2e") or null when it's a check to run before pushing.
// A line-based reader: enough for ordinary workflow files, without a YAML dependency.
export function workflowSteps(text, file) {
  const lines = text.split(/\r?\n/);
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) return [];
  const steps = [];
  let job = null;
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;
    const jobHead = line.match(/^ {2}([\w-]+):\s*$/);
    if (jobHead) {
      const body = [];
      for (let j = i + 1; j < lines.length && !/^ {0,2}\S/.test(lines[j]); j++) body.push(lines[j]);
      const text = body.join("\n");
      job = {
        name: jobHead[1],
        dir: text.match(/^ {4}defaults:\s*\n\s+run:\s*\n\s+working-directory:\s*(\S+)/m)?.[1] ?? null,
        secrets: /\$\{\{\s*secrets\./.test(text.split(/^ {4}steps:/m)[0]),
        services: /^ {4}services:/m.test(text),
        pushOnly: /^ {4}if:.*github\.event_name\s*==\s*'push'/m.test(text),
      };
      continue;
    }
    if (!job) continue;
    const runLine = line.match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!runLine) continue;
    let command = runLine[2].trim();
    if (/^[|>][-+]?$/.test(command)) {
      const indent = runLine[1].length;
      const block = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() && lines[j].search(/\S/) <= indent) break;
        block.push(lines[j].trim());
      }
      command = block.filter(Boolean).join("\n");
    }
    // Step-level keys sit next to run: in the same list item.
    let start = i;
    while (start > 0 && !/^\s*- /.test(lines[start])) start--;
    let end = i + 1;
    while (end < lines.length && lines[end].trim() && !/^\s*- /.test(lines[end]) && lines[end].search(/\S/) > lines[start].search(/\S/)) end++;
    const item = lines.slice(start, end).join("\n");
    const dir = item.match(/working-directory:\s*(\S+)/)?.[1] ?? job.dir;
    const usesSecrets = job.secrets || /\$\{\{\s*secrets\./.test(item);
    const skip =
      job.pushOnly ? "deploy"
      : /\b(deploy|release|publish)\b/i.test(job.name + " " + command) && !/--dry-run\b/.test(command) ? "deploy"
      : /\b(npm|pnpm|yarn)\s+(ci|install)\b|\bdotnet\s+(restore|tool\s+restore)\b|\bpip\s+install\b|\buv\s+sync\b|\bgo\s+mod\s+download\b|\bnpm\s+install\s+-g\b/i.test(command) && !/&&|;/.test(command) ? "install"
      : usesSecrets ? "secrets"
      : job.services ? "services"
      : /\be2e\b|playwright|cypress/i.test(command) ? "e2e"
      : /^echo\b/.test(command) ? "noop"
      : null;
    steps.push({ workflow: file, job: job.name, dir, command, skip });
  }
  return steps;
}

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: opts.timeout ?? 15000, stdio: ["ignore", "pipe", "ignore"], cwd: opts.cwd }).trim();
  } catch {
    return null;
  }
}
const git = (...a) => run("git", a);
const gh = (...a) => run("gh", a, { timeout: 20000 });
const json = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

const root = git("rev-parse", "--show-toplevel");
if (!root) {
  console.error("Not inside a git repository.");
  process.exit(1);
}
process.chdir(root);

const facts = { root, warnings: [] };

const repo = json(gh("repo", "view", "--json", "nameWithOwner,defaultBranchRef,deleteBranchOnMerge,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed"));
facts.repo = repo?.nameWithOwner ?? null;
if (!repo) facts.warnings.push("gh couldn't read the GitHub repo (no remote, not signed in, or not on GitHub).");
facts.base = repo?.defaultBranchRef?.name ?? git("symbolic-ref", "--short", "refs/remotes/origin/HEAD")?.replace(/^origin\//, "") ?? "main";
facts.autoDeleteBranch = repo?.deleteBranchOnMerge ?? null;
facts.mergeMethodsAllowed = repo ? ["merge", "squash", "rebase"].filter((m) => repo[`${m === "merge" ? "mergeCommit" : m}${m === "merge" ? "" : "Merge"}Allowed`]) : [];

git("fetch", "--quiet", "origin");
facts.branch = git("rev-parse", "--abbrev-ref", "HEAD");
facts.onBase = facts.branch === facts.base;
facts.head = git("rev-parse", "HEAD");

const status = git("status", "--porcelain") ?? "";
facts.uncommitted = status ? status.split("\n").map((l) => l.trim()) : [];
facts.secretsInTree = facts.uncommitted.filter((l) => /(^|[\s/])\.env(\.|$)|\.pem$|\.key$|credentials|secret/i.test(l));

const upstream = git("rev-parse", "--abbrev-ref", "@{upstream}");
facts.upstream = upstream;
const counts = (range) => git("rev-list", "--count", range);
facts.unpushed = upstream ? Number(counts(`${upstream}..HEAD`)) : null;
facts.commitsAheadOfBase = Number(counts(`origin/${facts.base}..HEAD`) ?? 0);
facts.commitsBehindBase = Number(counts(`HEAD..origin/${facts.base}`) ?? 0);
facts.branchCommits = (git("log", "--format=%h %s", `origin/${facts.base}..HEAD`) ?? "").split("\n").filter(Boolean);

// Merge style the repo actually uses: GitHub merge commits vs squashed "(#N)" subjects.
const recent = (git("log", "--first-parent", "--format=%s", "-20", `origin/${facts.base}`) ?? "").split("\n");
const mergeCommits = recent.filter((s) => /^Merge pull request #\d+/.test(s)).length;
const squashed = recent.filter((s) => /\(#\d+\)$/.test(s)).length;
facts.mergeStyle = mergeCommits >= squashed ? "merge" : "squash";
if (!facts.mergeMethodsAllowed.includes(facts.mergeStyle) && facts.mergeMethodsAllowed.length) facts.mergeStyle = facts.mergeMethodsAllowed[0];
facts.recentSubjects = (git("log", "--no-merges", "--format=%s", "-12", `origin/${facts.base}`) ?? "").split("\n").filter(Boolean);

// Existing PR for this branch.
if (!facts.onBase && repo) {
  const pr = json(gh("pr", "view", "--json", "number,url,state,title,headRefOid,isDraft,mergeable,reviewDecision,closingIssuesReferences"));
  facts.pr = pr ? { number: pr.number, url: pr.url, state: pr.state, title: pr.title, draft: pr.isDraft, headPushed: pr.headRefOid, mergeable: pr.mergeable, reviewDecision: pr.reviewDecision, closes: pr.closingIssuesReferences?.map((i) => i.number) ?? [] } : null;
}

// Workflows: which run on PRs, and which deploy on a push to the base branch.
facts.ci = { onPullRequest: [], deployOnMerge: [], steps: [] };
const wfDir = join(root, ".github", "workflows");
if (existsSync(wfDir)) {
  for (const f of readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n))) {
    // Comments are dropped so a note like "how its result is published" isn't read as a deploy.
    // Line endings are normalized first: on a Windows checkout (core.autocrlf) a pattern that can
    // cross a \r would eat the step after a comment.
    const text = readFileSync(join(wfDir, f), "utf8")
      .replace(/\r\n?/g, "\n")
      .replace(/^[ \t]*#.*$/gm, "")
      .replace(/[ \t]+#[ \t].*$/gm, "");
    const on = text.match(/^on:\s*([\s\S]*?)^(?=\S)/m)?.[1] ?? text.match(/^on:\s*(.*)$/m)?.[1] ?? "";
    if (/pull_request/.test(on)) {
      facts.ci.onPullRequest.push(f);
      facts.ci.steps.push(...workflowSteps(text, f));
    }
    const pushesBase = /push/.test(on) && (new RegExp(`\\b${facts.base}\\b`).test(on) || !/branches/.test(on));
    if (pushesBase && /deploy|release|publish|wrangler\s+deploy|environment:/i.test(text)) {
      const jobs = [...text.matchAll(/^ {2}([\w-]*(?:deploy|release|publish)[\w-]*):\s*$/gim)].map((m) => m[1]);
      facts.ci.deployOnMerge.push(jobs.length ? `${f} (${[...new Set(jobs)].join(", ")})` : f);
    }
  }
}

// Issue candidates: branch name number, "#N" in branch commits, the spec folder's issue.
const issues = new Set();
const branchNum = facts.branch?.match(/(?:^|[/-])(?:issue-?)?(\d{1,5})(?:-|$)/i)?.[1];
const specPrefix = facts.branch?.match(/^(?:[\w-]+\/)?(\d{3})-/)?.[1];
if (branchNum && !specPrefix) issues.add(Number(branchNum));
for (const c of facts.branchCommits) for (const m of c.matchAll(/#(\d+)/g)) issues.add(Number(m[1]));
if (specPrefix && existsSync(join(root, "specs"))) {
  const dir = readdirSync(join(root, "specs")).find((d) => d.startsWith(specPrefix + "-"));
  const spec = dir && existsSync(join(root, "specs", dir, "spec.md")) ? readFileSync(join(root, "specs", dir, "spec.md"), "utf8") : "";
  for (const m of spec.matchAll(/(?:issue|#)\s*#?(\d+)/gi)) issues.add(Number(m[1]));
}
facts.issueCandidates = [];
for (const n of [...issues].slice(0, 5)) {
  const i = repo && json(gh("issue", "view", String(n), "--json", "number,title,state"));
  if (i) facts.issueCandidates.push(`#${i.number} ${i.state} ${i.title}`);
}

// Worktrees holding the base branch block a local checkout of it.
const wt = git("worktree", "list", "--porcelain") ?? "";
facts.baseCheckedOutElsewhere = wt.split("\n\n").some((b) => b.includes(`branch refs/heads/${facts.base}`) && !b.startsWith(`worktree ${root.replace(/\\/g, "/")}`));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(facts, null, 2));
} else {
  const out = [];
  out.push(`repo:      ${facts.repo ?? "(unknown)"}  base: ${facts.base}  branch: ${facts.branch}${facts.onBase ? "  <- ON BASE BRANCH" : ""}`);
  out.push(`changes:   ${facts.uncommitted.length} uncommitted file(s); ${facts.commitsAheadOfBase} commit(s) ahead of origin/${facts.base}, ${facts.commitsBehindBase} behind; ${facts.upstream ? `${facts.unpushed} unpushed` : "no upstream yet"}`);
  if (facts.secretsInTree.length) out.push(`SECRETS?:  ${facts.secretsInTree.join(", ")}`);
  for (const c of facts.branchCommits.slice(0, 15)) out.push(`  commit   ${c}`);
  out.push(`pr:        ${facts.pr ? `#${facts.pr.number} ${facts.pr.state}${facts.pr.draft ? " draft" : ""} ${facts.pr.url} (mergeable: ${facts.pr.mergeable}, review: ${facts.pr.reviewDecision || "none"}, closes: ${facts.pr.closes.join(",") || "-"})` : "none for this branch"}`);
  out.push(`ci:        ${facts.ci.onPullRequest.length ? facts.ci.onPullRequest.join(", ") : "no workflows run on pull requests"}`);
  if (facts.ci.steps.length) {
    out.push("ci steps:  run locally before pushing (`skip:` ones stay with CI)");
    for (const s of facts.ci.steps) {
      const cmd = s.command.split("\n").map((l, i) => (i ? "             " + l : l)).join("\n");
      out.push(`  ${s.skip ? `skip:${s.skip}`.padEnd(14) : "run".padEnd(14)} [${s.job}]${s.dir ? ` (cd ${s.dir})` : ""} ${cmd}`);
    }
  }
  out.push(`on merge:  ${facts.ci.deployOnMerge.length ? "DEPLOYS via " + facts.ci.deployOnMerge.join("; ") : "no deploy workflow on push to " + facts.base}`);
  out.push(`merge:     --${facts.mergeStyle} (repo history); allowed: ${facts.mergeMethodsAllowed.join(", ") || "?"}; GitHub auto-deletes branch: ${facts.autoDeleteBranch}`);
  out.push(`issues:    ${facts.issueCandidates.length ? facts.issueCandidates.join(" | ") : "none found"}`);
  if (facts.baseCheckedOutElsewhere) out.push(`note:      ${facts.base} is checked out in another worktree; update it there instead of switching here.`);
  out.push(`style:     ${facts.recentSubjects.slice(0, 5).join(" | ")}`);
  for (const w of facts.warnings) out.push(`warning:   ${w}`);
  console.log(out.join("\n"));
}
