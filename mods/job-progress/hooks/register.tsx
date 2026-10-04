import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Job } from '../types'
import { parse } from './parse'

const PANE = 'job-progress'
const SHELLS = ['Bash', 'PowerShell']
const jobs = atom({ plugin: 'job-progress', key: 'jobs' } as const, [])

// Test runners that get moved to the background (when the call left
// run_in_background unset) so the pane can follow them. Anything else
// shows up once Claude backgrounds it or it outlives the shell timeout.
const RUNNER =
  /\b(vitest|jest|pytest|dotnet\s+test|go\s+test|cargo\s+test|playwright(\.js)?\s+test|cli\.js\s+test)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|e2e|bench)[\w:-]*/i

const HINT =
  '\n\nLong-running jobs (test suites, e2e runs, scenario or eval runs, batch processing such as running ' +
  'test images through a pipeline): run them with run_in_background so the person can watch them in their ' +
  'Progress pane. Do not pipe a background job through tail, head or grep: that holds its output back until it ' +
  'ends and the pane stays blank; read the output file afterwards instead. In scripts you write for such runs, ' +
  'print a line `PROGRESS <done>/<total> <item>` as each item finishes (and flush, e.g. python -u).'

// `| tail -N` / `| head -N` ending a step (before &&, ||, ; or the end) of a command the pane follows:
// dropped, since a background job's output goes to a file anyway and the pipe would hide all
// progress until that step ends.
const TAIL_PIPE = /\s*\|\s*(tail|head)(\s+-n)?\s+-?\d+(?=\s*(&&|\|\||;|$))/g

// Python block-buffers stdout written to a file, so a background job's progress lines would only
// land in big chunks. Bash gets PYTHONUNBUFFERED; PowerShell sets it on $env.
const unbuffered = (tool: string, command: string) =>
  tool === 'PowerShell' ? `$env:PYTHONUNBUFFERED = '1'; ${command}` : `export PYTHONUNBUFFERED=1; ${command}`

function backgroundCommand(tool: string, command: string): string {
  return unbuffered(tool, command.replace(TAIL_PIPE, ''))
}

const PINK = '#ED93B1'
const DEEP_PINK = '#D4537E'
const LEAF = '#639922'
const WILT = '#A32D2D'
const STAGES = ['🌰', '🌱', '🌿', '🪴', '🌸']

const isBloomed = (job: Job) => job.status === 'completed' && !job.failed

const STARTED = /running in background with ID: (\w+)\. Output is being written to: (.+?\.output)/

// Every string in a row's content (text blocks, tool_result bodies), joined, so the
// regexes see real text rather than JSON-escaped text.
function rowText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(rowText).join('\n')
  if (content && typeof content === 'object') {
    const block = content as { text?: unknown; content?: unknown; tool_use_id?: unknown }
    const id = typeof block.tool_use_id === 'string' ? `tool_use_id=${block.tool_use_id}` : ''
    return [id, rowText(block.text), rowText(block.content)].join('\n')
  }
  return ''
}

async function refresh($: EngineInterface, job: Job, status?: string) {
  let patch: Partial<Job> = {}
  try {
    const stat = await $.fs.stat(job.path)
    if (stat.size !== job.size || status) {
      // ponytail: whole-file read, capped at 4 MiB by $.fs.read; past that the pane keeps the last reading.
      patch = { size: stat.size, ...(stat.size < 4 * 1024 * 1024 ? parse(await $.fs.read(job.path)) : {}) }
    }
  } catch {
    // Output file not there yet, or gone: keep what the pane already shows.
  }
  if (status) patch = { ...patch, status, endedAt: await $.clock.now() }
  if (Object.keys(patch).length === 0) return
  await update($, jobs, list => (list ?? []).map(j => (j.id === job.id ? { ...j, ...patch } : j)))
}

function summary(job: Job): string {
  const bits: string[] = []
  if (job.total) bits.push(`${job.done ?? 0}/${job.total}`)
  else if (job.pct !== undefined) bits.push(`${Math.round(job.pct)}%`)
  if (job.passed !== undefined) bits.push(`✓${job.passed}`)
  if (job.failed) bits.push(`✗${job.failed}`)
  return bits.join(' · ')
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

const clearFinished = ($: EngineInterface) => update($, jobs, l => (l ?? []).filter(j => j.status === 'running'))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progress',
      description: 'Show the progress pane for long-running jobs; /progress clear removes finished ones',
    })
    $.clock.every(1500, () => {
      void (async () => {
        const list = await read($, jobs)
        const running = (list ?? []).filter(j => j.status === 'running')
        for (const job of running) await refresh($, job)
        // Keeps elapsed time and ETA ticking while the output is quiet.
        if (running.length) $.ui.invalidate('ui.render')
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'progress' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await clearFinished($)
      return { text: 'Cleared finished jobs.' }
    }
    await $.ui.open({ id: PANE, title: 'Progress' })
    return { text: 'Progress pane opened.' }
  })

  on('tool.describe', async ($, e, next) => {
    const described = await next(e)
    return SHELLS.includes(e.tool) ? { ...described, description: described.description + HINT } : described
  })

  // Labels for shell calls, by tool_use_id, until their result row names the background task.
  const labels = new Map<string, string>()

  on('tool.call', async ($, e, next) => {
    if (!SHELLS.includes(e.tool)) return next(e)
    const args = e as typeof e & { command?: string; description?: string; run_in_background?: boolean }
    labels.set(e.tool_use_id, args.description || (args.command ?? '').slice(0, 60))
    const command = args.command ?? ''
    if (args.run_in_background === false || !(args.run_in_background || RUNNER.test(command))) return next(e)
    return next({ ...e, run_in_background: true, command: backgroundCommand(e.tool, command) })
  })

  // The shell's result row says where a background job writes ("running in background with ID: X.
  // Output is being written to: P"); its <task-notification> row says when it ended.
  on('session.append', async ($, e, next) => {
    const raw = rowText((e.message as { content?: unknown }).content)

    const started = STARTED.exec(raw)
    if (started) {
      const [, id, path] = started
      const useId = /tool_use_id=(\S+)/.exec(raw)?.[1]
      const job: Job = {
        id,
        path,
        label: (useId && labels.get(useId)) || 'Background job',
        startedAt: await $.clock.now(),
        status: 'running',
      }
      await update($, jobs, list => [...(list ?? []).filter(j => j.id !== id), job].slice(-20))
      void $.ui.open({ id: PANE, title: 'Progress' })
    }

    const id = /<task-id>([^<]+)<\/task-id>/.exec(raw)?.[1]
    const status = /<status>([^<]+)<\/status>/.exec(raw)?.[1]
    if (id && status) {
      const job = (await read($, jobs))?.find(j => j.id === id)
      if (job) {
        await refresh($, job, status)
        const done = (await read($, jobs))?.find(j => j.id === id)
        if (done) $.ui.toast(`${isBloomed(done) ? '🌸' : '🥀'} ${done.label} ${isBloomed(done) ? 'bloomed' : 'wilted'} ${summary(done)}`.trim())
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = (await read($, jobs)) ?? []
    const now = await $.clock.now()
    const width = Math.max(10, (e.props as { bodyColumns?: number }).bodyColumns ?? 40)
    const barWidth = Math.max(10, width - 14)

    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No jobs yet.</Text>
          <Text dimColor>Background test, scenario and batch runs show up here.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {[...list].reverse().map(job => {
          const running = job.status === 'running'
          const frac = job.total ? (job.done ?? 0) / job.total : job.pct !== undefined ? job.pct / 100 : undefined
          const elapsed = (job.endedAt ?? now) - job.startedAt
          const eta = running && frac && frac > 0.02 && frac < 1 ? ` · ~${duration(elapsed / frac - elapsed)} left` : ''
          const bloomed = isBloomed(job)
          const filled = running ? (frac === undefined ? 0 : Math.round(Math.min(1, frac) * barWidth)) : barWidth
          // Plant grows seed → sprout → leaves → potted while running; blooms or wilts at the end.
          const stage = running ? Math.min(3, Math.floor((frac ?? 0) * 4)) : 4
          const stages = STAGES.slice(0, stage + 1)
          if (!running) stages[4] = bloomed ? '🌸' : '🥀'
          return (
            <Box flexDirection="column" marginBottom={1}>
              <Text wrap="truncate-end">
                <Text color={running ? PINK : bloomed ? DEEP_PINK : WILT}>{running ? '● ' : bloomed ? '✿ ' : '✗ '}</Text>
                <Text bold>{job.label}</Text>
                <Text dimColor> {duration(elapsed)}</Text>
              </Text>
              {running && frac === undefined ? null : (
                <Text>
                  {/* Plain arrays, not fragments: a Fragment inside Text is refused as "Box inside an inline element". */}
                  {running
                    ? [
                        <Text color={PINK}>{'▰'.repeat(Math.max(0, filled - 1))}</Text>,
                        filled > 0 ? <Text color={LEAF}>▰</Text> : null,
                        <Text dimColor>{'▱'.repeat(barWidth - filled)}</Text>,
                        <Text> {Math.round((frac ?? 0) * 100)}%</Text>,
                      ]
                    : [
                        <Text color={bloomed ? DEEP_PINK : undefined} dimColor={!bloomed}>{'▰'.repeat(filled)}</Text>,
                        <Text color={bloomed ? DEEP_PINK : WILT}>{bloomed ? ' 🌸 bloomed' : ' 🥀 wilted'}</Text>,
                      ]}
                </Text>
              )}
              <Text wrap="truncate-end">
                {stages.join(' → ')}
                <Text dimColor>{' · '.repeat(4 - stage)}</Text>
              </Text>
              <Text dimColor wrap="truncate-end">
                {[summary(job), running || job.status === 'completed' ? '' : job.status].filter(Boolean).join(' · ') + eta}
              </Text>
              {running && job.last ? <Text dimColor wrap="truncate-end">› {job.last}</Text> : null}
            </Box>
          )
        })}
        {list.some(j => j.status !== 'running') ? (
          // Clicks reach it on the desktop and the fullscreen terminal; elsewhere press c while the pane has focus.
          <Button label="Clear finished" hotkey="c" onPress={() => clearFinished($)} />
        ) : null}
      </Box>
    )
  })
}
