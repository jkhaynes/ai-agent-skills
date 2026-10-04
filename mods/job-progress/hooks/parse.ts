// Reads progress out of a job's raw output. Works on whatever the runner prints:
// an explicit `PROGRESS 3/10 label` line wins, then [n/m] counters (Playwright),
// then a bare n/m, then a percentage; pass/fail counts come from runner summaries
// (vitest, jest, pytest, Playwright, dotnet test) or per-test marks.

export type Progress = {
  done?: number
  total?: number
  pct?: number
  passed?: number
  failed?: number
  /** What passed and failed count (`2 scenarios passed · 1 failed`); absent for plain tests. */
  unit?: string
  last?: string
}

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g

function lastMatch(re: RegExp, text: string): RegExpExecArray | undefined {
  let m: RegExpExecArray | null
  let found: RegExpExecArray | undefined
  re.lastIndex = 0
  while ((m = re.exec(text))) found = m
  return found
}

// The last n/m pair that reads as progress. Card numbers (`096/182`, zero-padded) and
// centering ratios (`42/58`, the two sides summing to 100) are skipped.
function lastProgress(re: RegExp, text: string): RegExpExecArray | undefined {
  const all = [...text.matchAll(re)] as RegExpExecArray[]
  for (const m of all.reverse()) {
    const [, a = '', b = ''] = m
    const done = Number(a), total = Number(b)
    if (/^0\d/.test(a) || /^0\d/.test(b)) continue
    if (done + total === 100 && done !== total && total !== 100) continue
    if (total > 1 && done <= total) return m
  }
  return undefined
}

function lastNum(re: RegExp, text: string): number | undefined {
  const m = lastMatch(re, text)
  return m ? Number(m[1]) : undefined
}

export function parse(raw: string): Progress {
  const text = raw.replace(ANSI, '').replace(/\r(?!\n)/g, '\n')
  const out: Progress = {}

  const explicit = lastMatch(/^PROGRESS\s+(\d+)\s*\/\s*(\d+)/gm, text)
  const bracket = lastProgress(/\[\s*(\d+)\s*\/\s*(\d+)\s*\]/g, text)
  const bare = lastProgress(/(?<![\w\/.:-])(\d{1,6}) ?\/ ?(\d{1,6})(?![\w\/.:-])/g, text)
  for (const m of [explicit, bracket, bare]) {
    if (m && Number(m[2]) > 1 && Number(m[1]) <= Number(m[2])) {
      out.done = Number(m[1])
      out.total = Number(m[2])
      break
    }
  }
  if (out.total === undefined) {
    const pct = lastNum(/(?<![\d.])(\d{1,3}(?:\.\d+)?)\s?%/g, text)
    if (pct !== undefined && pct <= 100) out.pct = pct
    // A runner that announces its size up front ("Running 40 tests", "collected 40 items").
    const planned = lastNum(/(?:Running|collected)\s+(\d+)\s+(?:tests?|items?)/gi, text)
    if (planned) out.total = planned
  }

  // Summary lines first; per-test marks as a fallback while the run is still going.
  // Only counts shaped like a summary: "3 failed | 88 passed", "1 failed, 41 passed in 2s", "  2 failed".
  // Not "0.85 failed" (a reading), "attempt 1 failed" (a retry) or "2/3 passed" (a sub-score).
  const count = (word: string) =>
    new RegExp(String.raw`(?<![\d./])(?<!attempt )(\d+) +${word}(?=[ \t]*(?:$|[,|(;=]|in\b))`, 'gim')
  out.passed = lastNum(count('passed'), text) ?? lastNum(/Passed:\s+(\d+)/g, text)
  out.failed = lastNum(count('failed'), text) ?? lastNum(/Failed:\s+(\d+)/g, text)

  pokeJudge(text, out)

  // ten-or-not attack sweeps: one "shadow-dirs   165 cases  2 WRONG" line per family.
  const families = [...text.matchAll(/^\s*[\w-]+\s+(\d+) cases\s+(\d+) WRONG\s*$/gm)]
  if (families.length && out.passed === undefined && out.failed === undefined) {
    out.failed = families.reduce((n, m) => n + Number(m[2]), 0)
    out.passed = families.reduce((n, m) => n + Number(m[1]), 0) - out.failed
  }

  if (out.passed === undefined && out.failed === undefined) {
    const pass = text.match(/^\s*(?:✓|✔|√|ok\b|PASS\b|Passed\s)/gm)?.length ?? 0
    const fail = text.match(/^\s*(?:✘|✗|×|not ok\b|FAIL\b|Failed\s)/gm)?.length ?? 0
    if (pass || fail) {
      out.passed = pass
      out.failed = fail
    }
  }
  if (out.done === undefined && out.total && (out.passed ?? 0) + (out.failed ?? 0) > 0) {
    out.done = Math.min(out.total, (out.passed ?? 0) + (out.failed ?? 0))
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  out.last ??= lines.at(-1)?.slice(0, 200)
  return out
}

// PokeJudge evals. Each scenario opens with "--- [id] Category ---" and lists [PASS]/[FAIL]
// criteria; each eval process ends with "Result: 13/20 scenarios fully passed …". A loop of
// one-scenario evals (each wrapped in "=== id ===") has a Result line per scenario.
//
// The pane names the scenario being worked on rather than the last line ("Pacing model calls…").
// Counts are scenarios: the Result lines summed once any exist, otherwise the finished blocks so
// far (a block is finished when the next one or "--- By category ---" starts), passed when it has
// no [FAIL]. A one-process eval also gets its bar from "N scenario(s), R run(s) each".
function pokeJudge(text: string, out: Progress) {
  const results = [...text.matchAll(/^Result:\s+(\d+)\/(\d+) scenarios fully passed/gm)]
  if (results.length) {
    out.unit = 'scenarios'
    out.passed = results.reduce((n, m) => n + Number(m[1]), 0)
    out.failed = results.reduce((n, m) => n + Number(m[2]) - Number(m[1]), 0)
  }

  const marks = [...text.matchAll(/^--- \[([\w-]+)\] (.+?) ---$|^=== ([\w-]+) ===$|^--- By category ---$/gm)]
  if (!marks.length) return
  out.unit = 'scenarios'

  const current = marks.filter(m => m[1] || m[3]).at(-1)
  if (current) out.last = current[1] ? `${current[1]} · ${current[2]}` : current[3]

  // A loop gets its bar from its own PROGRESS lines; one process for the whole eval counts its
  // finished scenario blocks.
  if (marks.some(m => m[3])) return
  let passed = 0
  let failed = 0
  marks.forEach((mark, i) => {
    const next = marks[i + 1]
    if (!mark[1] || !next) return
    if (/^\s*\[FAIL\]/m.test(text.slice(mark.index, next.index))) failed++
    else passed++
  })
  if (!results.length) {
    out.passed = passed
    out.failed = failed
  }
  // Over any n/m read earlier: "Result: 2/3" is a score, not how far the eval has got.
  const planned = /(\d+) scenario\(s\), (\d+) run\(s\) each/.exec(text)
  if (planned) {
    out.total = Number(planned[1]) * Number(planned[2])
    out.done = results.length ? out.total : passed + failed
  }
}
