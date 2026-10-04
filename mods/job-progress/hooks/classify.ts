// Which shell commands the pane follows, which are dev servers, and when a sleep is refused.
// Plain functions with no engine in them, so `classify.check.mts` runs them under Node.

import type { Job } from '../types'

// Every step of a shell command (split at &&, ||, ;, | and newlines) as the program it runs.
// Quoted text is blanked first, so a runner named inside a filter, a pattern or a message
// (`-notmatch 'playwright|vitest'`, `grep "pytest"`) doesn't count. Leading env assignments,
// `time`, `timeout N` and wrappers (npx, bunx, pnpm exec, uv run, poetry run) are dropped so
// the step starts with its program; `timed` says a `timeout N` came off.
function steps(command: string): { program: string; timed: boolean }[] {
  const unquoted = command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""')
  return unquoted
    .split(/&&|\|\||[;|\n]/)
    .map(raw => {
      let program = raw.trim().replace(/^[({&\s]+/, '')
      let timed = false
      for (;;) {
        const next = program
          .replace(/^[({]\s*/, '')
          .replace(/^(do|then|else|!)\s+/, '')
          .replace(/^export\s+\w+=\S*\s*/, '')
          .replace(/^\$env:\w+\s*=\s*\S+\s*/i, '')
          .replace(/^\w+=\S*\s+/, '')
          .replace(/^time\s+(-p\s+)?/, '')
          .replace(/^timeout\s+\d+\s+/, () => ((timed = true), ''))
          .replace(/^(npx|bunx|pnpm\s+exec|uv\s+run|poetry\s+run)\s+(--?[\w-]+(=\S+)?\s+)*/, '')
        if (next === program) break
        program = next
      }
      return { program, timed }
    })
    .filter(step => step.program)
}

const anyOf = (...parts: string[]) => new RegExp(`^(?:${parts.join('|')})`, 'i')

// Test runners, moved to the background (when the call left run_in_background unset) so the
// pane can follow them. Anything else shows up once Claude backgrounds it.
const RUNNER = anyOf(
  String.raw`(vitest|jest|pytest)\b`,
  String.raw`playwright\s+test\b`,
  String.raw`python\d?\s+-m\s+pytest\b`,
  String.raw`(dotnet|go|cargo)\s+test\b`,
  String.raw`(npm|pnpm|yarn|bun)\s+(run\s+)?(test|e2e|bench)[\w:-]*`,
  String.raw`node\s+(\S+\s+)*?\S*cli\.js\s+test\b`,
)

// Long runs from my own projects that ran in the foreground, out of the pane's sight: PokeJudge
// evals, ten-or-not attack sweeps and tuning snapshots, CI and deploy watches.
const MY_RUNS = anyOf(
  String.raw`dotnet\s+run\b.*\bevaluate\b`,
  String.raw`python\d?\s+\S*(attacks|tuning_report|make_e2e_fixtures|click_measure)\.py\b`,
  String.raw`gh\s+run\s+watch\b`,
  String.raw`gh\s+pr\s+checks\b.*--watch`,
)
// Log tails, only when a `timeout N` bounds them.
const TIMED_TAIL = anyOf(String.raw`(node\s+\S*)?wrangler(\.js)?\s+tail\b`)

// Dev servers (LMI's dev:e2e and bench:serve, vite, wrangler dev, uvicorn): they never finish,
// so the pane lists them apart, with their port and a Stop button, and stopping one isn't a wilt.
const SERVER = anyOf(
  String.raw`(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|serve|start)[\w:-]*`,
  String.raw`(npm|pnpm|yarn|bun)\s+run\s+bench:serve\b`,
  String.raw`(node\s+\S*)?wrangler(\.js)?\s+dev\b`,
  String.raw`vite\b(?!\s+build)`,
  String.raw`(python\d?\s+-m\s+)?uvicorn\b`,
  String.raw`dotnet\s+watch\b`,
)
const PORT = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})|--port[= ](\d{2,5})|\bPORT=(\d{2,5})/

// A foreground sleep of a minute or more, which Claude uses to wait on its own background jobs.
const LONG_SLEEP = /^\s*(?:Start-)?sleep\s+(?:-Seconds\s+)?(\d+)/i

export const isFollowed = (command: string) =>
  steps(command).some(({ program, timed }) => RUNNER.test(program) || MY_RUNS.test(program) || (timed && TIMED_TAIL.test(program)))

export const isServerCommand = (command: string) => steps(command).some(({ program }) => SERVER.test(program))

export function portOf(text: string): number | undefined {
  const m = PORT.exec(text)
  return m ? Number(m[1] ?? m[2] ?? m[3]) : undefined
}

// The deny for a foreground `sleep 60+` while a job (not a server) is running, or undefined.
export function sleepDenial(command: string, jobs: readonly Job[]): string | undefined {
  const sleep = LONG_SLEEP.exec(command)
  if (!sleep || Number(sleep[1]) < 60) return undefined
  const waiting = jobs.filter(j => j.status === 'running' && j.kind !== 'server')
  if (!waiting.length) return undefined
  return (
    `job-progress: ${waiting.map(j => `"${j.label}"`).join(', ')} is still running in the background. ` +
    'You get a <task-notification> when it ends, so do not sleep to wait for it: do other work or end your turn.'
  )
}

// The servers `/progress stop [n]` stops: all of them, or the nth as the pane numbers them
// (the same order as their Stop hotkeys). An error message when there is nothing to stop.
export function serversToStop(jobs: readonly Job[], which: string): Job[] | string {
  const servers = jobs.filter(j => j.kind === 'server' && j.status === 'running')
  if (!servers.length) return 'No dev servers are running.'
  if (!which) return servers
  const n = Number(which)
  const server = Number.isInteger(n) ? servers[n - 1] : undefined
  if (!server) return `There is no server ${which}; the pane lists ${servers.length} (1–${servers.length}).`
  return [server]
}

// Why a plugin's TaskStop call did not stop the task, or undefined when it did. The call
// answers `{ deny }` when refused and `{ isError, text }` when the tool failed.
export function stopFailure(answer: { deny?: string; isError?: boolean; text?: string }): string | undefined {
  if (answer.deny) return answer.deny
  if (answer.isError) return answer.text || 'TaskStop returned an error'
  return undefined
}

// Background dev servers carry a marker in their shell's command line so a stop can find them.
// TaskStop alone can't stop them on Windows: an npm script runs in Git Bash, which starts each
// program through a helper process that exits, so no Windows parent link reaches the server
// and TaskStop leaves the whole tree running. Git Bash's own process table still groups
// everything the task started under one process group, which killTreeScript uses.
export const TAG_VAR = 'JOB_PROGRESS_TAG'

export function tagCommand(tool: string, command: string, tag: string): string {
  return tool === 'PowerShell' ? `$env:${TAG_VAR} = '${tag}'; ${command}` : `export ${TAG_VAR}=${tag}; ${command}`
}

// Run by Git Bash as `bash -c KILL_TREE kill-tree <tag>`. Finds the processes whose command line
// carries the marker, kills the Git Bash process group they lead, then the Windows tree under
// each marked process (a PowerShell task has no group). Prints "killed <n> left <m>".
export const KILL_TREE = String.raw`
tag="$1"
# The pattern is built in two parts so this script's own command line never matches it.
wins=$(powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like ('*JOB_PROGRESS' + '_TAG' + '*$tag*') -and \$_.Name -notmatch 'powershell|pwsh' } | ForEach-Object { \$_.ProcessId }" | tr -d '\r' | tr '\n' ' ')
pgid=$(ps | awk -v ws=" $wins " 'NR>1 && index(ws, " " $4 " ") { print $3; exit }')
targets="$wins"
[ -n "$pgid" ] && targets="$targets $(ps | awk -v g="$pgid" 'NR>1 && $3 == g { print $4 }' | tr '\n' ' ')"
n=0
for w in $targets; do taskkill //PID "$w" //T //F >/dev/null 2>&1 && n=$((n + 1)); done
left=0
[ -n "$pgid" ] && left=$(ps | awk -v g="$pgid" 'NR>1 && $3 == g' | wc -l)
echo "killed $n left $left"
`

// What the kill script printed: how many it killed and how many are still running.
export function killResult(stdout: string): { killed: number; left: number } | undefined {
  const m = /killed (\d+) left (\d+)/.exec(stdout)
  return m ? { killed: Number(m[1]), left: Number(m[2]) } : undefined
}
