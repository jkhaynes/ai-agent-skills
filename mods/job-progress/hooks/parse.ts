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

function lastNum(re: RegExp, text: string): number | undefined {
  const m = lastMatch(re, text)
  return m ? Number(m[1]) : undefined
}

export function parse(raw: string): Progress {
  const text = raw.replace(ANSI, '').replace(/\r(?!\n)/g, '\n')
  const out: Progress = {}

  const explicit = lastMatch(/^PROGRESS\s+(\d+)\s*\/\s*(\d+)/gm, text)
  const bracket = lastMatch(/\[\s*(\d+)\s*\/\s*(\d+)\s*\]/g, text)
  const bare = lastMatch(/(?<![\w\/.:-])(\d{1,6}) ?\/ ?(\d{1,6})(?![\w\/.:-])/g, text)
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
  out.passed = lastNum(/(\d+)\s+passed/gi, text) ?? lastNum(/Passed:\s+(\d+)/g, text)
  out.failed = lastNum(/(\d+)\s+failed/gi, text) ?? lastNum(/Failed:\s+(\d+)/g, text)
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
  out.last = lines.at(-1)?.slice(0, 200)
  return out
}
