import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Job } from '../types'
import { KILL_TREE, isFollowed, isServerCommand, killResult, portOf, serversToStop, sleepDenial, stopFailure, tagCommand } from './classify'
import { parse } from './parse'

const PANE = 'job-progress'
// closeOnEscape: in the terminal's main screen the pane has no close mark, so Esc (at an idle,
// empty prompt) closes it, as do /progress and the pane's Close button.
const OPEN = { id: PANE, title: 'Progress', closeOnEscape: true } as const
const SHELLS = ['Bash', 'PowerShell']
const jobs = atom({ plugin: 'job-progress', key: 'jobs' } as const, [])

const HINT =
  '\n\nLong-running jobs (test suites, e2e runs, scenario or eval runs, batch processing such as running ' +
  'test images through a pipeline): run them with run_in_background so the person can watch them in their ' +
  'Progress pane. Do not pipe a background job through tail, head or grep: that holds its output back until it ' +
  'ends and the pane stays blank; read the output file afterwards instead. In scripts you write for such runs, ' +
  'print a line `PROGRESS <done>/<total> <item>` as each item finishes (and flush, e.g. python -u). ' +
  'Do not redirect a background job into a log file of your own (`> "$LOG"`, `> /tmp/e2e.log`): its output ' +
  'file is already the log, and the pane can only follow that one. Do not `sleep` to wait for a background job: ' +
  'you are notified when it ends, so do other work or end your turn.'

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
const isServer = (job: Job) => job.kind === 'server'
// A job whose output gave a count, a percentage or pass/fail numbers. One without any gets
// no bar and no plant: there is nothing to draw them from.
const hasProgress = (job: Job) =>
  job.total !== undefined || job.pct !== undefined || job.passed !== undefined || job.failed !== undefined
// A job with no progress that ends this fast was a quick command Claude ran in the background,
// not a run worth a row or a toast.
const QUICK_MS = 30_000
const BAR_MAX = 40

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
      const text = stat.size < 4 * 1024 * 1024 ? await $.fs.read(job.path) : undefined
      patch = { size: stat.size, ...(text === undefined ? {} : isServer(job) ? { port: job.port ?? portOf(text) } : parse(text)) }
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
  if (job.unit && (job.passed !== undefined || job.failed !== undefined)) {
    // "2 scenarios passed · 1 failed", where counting in the run's own terms reads better than ✓/✗.
    bits.push(`${job.passed ?? 0} ${job.unit} passed`, `${job.failed ?? 0} failed`)
    return bits.join(' · ')
  }
  if (job.passed !== undefined) bits.push(`✓${job.passed}`)
  if (job.failed) bits.push(`✗${job.failed}`)
  return bits.join(' · ')
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

const clearFinished = ($: EngineInterface) => update($, jobs, l => (l ?? []).filter(j => j.status === 'running'))
const closePane = ($: EngineInterface) => $.ui.close({ id: PANE })
const GIT_BASH = 'C:/Program Files/Git/bin/bash.exe'

// Kills a marked server's whole process tree (see KILL_TREE); undefined when that couldn't run
// (no Git Bash, or the script hung).
async function killTree($: EngineInterface, tag: string) {
  try {
    return killResult((await $.process.run([GIT_BASH, '-c', KILL_TREE, 'kill-tree', tag], { timeoutMs: 20000 })).stdout)
  } catch {
    return undefined
  }
}

// Stops a dev server for /progress stop and the Stop button. It goes through TaskStop like Claude's
// own stops, so the TaskStop hook in register does the whole-tree kill and drops the row.
// Returns why it didn't stop, and then the row stays.
async function stopServer($: EngineInterface, job: Job): Promise<string | undefined> {
  let failure: string | undefined
  try {
    failure = stopFailure(await $.tool.call({ tool: 'TaskStop', task_id: job.id }))
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err)
  }
  if (failure) return failure
  // Without the marker only TaskStop ran, which can report success and leave an npm server running.
  if (!job.tag) return UNCONFIRMED
  return undefined
}

const UNCONFIRMED =
  'its task was stopped, but it started before job-progress marked servers, so its processes may still be running. Check its port'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progress',
      description: 'Toggle the progress pane; /progress close hides it, /progress clear removes finished jobs, /progress stop [n] stops dev servers',
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
    const arg = e.args.trim()
    if (arg === 'clear') {
      await clearFinished($)
      return { text: 'Cleared finished jobs.' }
    }
    const stop = /^stop(?:\s+(\S+))?$/.exec(arg)
    if (stop) {
      const servers = serversToStop((await read($, jobs)) ?? [], stop[1] ?? '')
      if (typeof servers === 'string') return { text: servers }
      const lines: string[] = []
      for (const server of servers) {
        const failure = await stopServer($, server)
        lines.push(
          failure === UNCONFIRMED
            ? `${server.label}: ${failure}.`
            : failure
              ? `Could not stop ${server.label} (${server.id}): ${failure}`
              : `Stopped ${server.label}.`,
        )
      }
      return { text: lines.join('\n') }
    }
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (arg === 'close' || (arg === '' && isOpen)) {
      await closePane($)
      return { text: 'Progress pane closed.' }
    }
    await $.ui.open(OPEN)
    return { text: 'Progress pane opened.' }
  })

  on('tool.describe', async ($, e, next) => {
    const described = await next(e)
    return SHELLS.includes(e.tool) ? { ...described, description: described.description + HINT } : described
  })

  // Every TaskStop, Claude's own and the pane's, comes through here. A TaskStop raises no
  // <task-notification>, so without this the pane never hears that a job was stopped. And on Windows
  // TaskStop leaves an npm server's process tree running, so a marked server's tree is killed first.
  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const input = e as typeof e & { task_id?: string; shell_id?: string }
    const id = input.task_id ?? input.shell_id
    const job = ((await read($, jobs)) ?? []).find(j => j.id === id)
    if (!job || job.status !== 'running') return next(e)
    const tree = job.tag ? await killTree($, job.tag) : undefined
    if (tree && tree.left > 0) {
      return { deny: `job-progress: ${tree.left} of the processes of "${job.label}" are still running after taskkill.` }
    }
    const answer = await next(e)
    const failure = stopFailure(answer)
    // Once the tree is gone the task may already have ended, and TaskStop then has nothing to stop.
    if (failure && !(tree && tree.killed > 0)) return answer
    if (isServer(job)) {
      await update($, jobs, list => (list ?? []).filter(j => j.id !== job.id))
    } else {
      const endedAt = await $.clock.now()
      await update($, jobs, list => (list ?? []).map(j => (j.id === job.id ? { ...j, status: 'killed', endedAt } : j)))
    }
    if (failure) {
      return { result: { message: `Stopped ${job.label}: its process tree was killed.`, task_id: job.id, task_type: 'local_bash', command: '' } }
    }
    return answer
  })

  // Labels and commands of shell calls, by tool_use_id, until their result row names the background task.
  const labels = new Map<string, { label: string; command: string }>()

  on('tool.call', async ($, e, next) => {
    if (!SHELLS.includes(e.tool)) return next(e)
    const args = e as typeof e & { command?: string; description?: string; run_in_background?: boolean }
    const command = args.command ?? ''
    labels.set(e.tool_use_id, { label: args.description || command.slice(0, 60), command })
    const deny = args.run_in_background ? undefined : sleepDenial(command, (await read($, jobs)) ?? [])
    if (deny) return { deny }
    if (args.run_in_background === false || !(args.run_in_background || isFollowed(command))) return next(e)
    const rewritten = backgroundCommand(e.tool, command)
    return next({
      ...e,
      run_in_background: true,
      command: isServerCommand(command) ? tagCommand(e.tool, rewritten, e.tool_use_id) : rewritten,
    })
  })

  // The shell's result row says where a background job writes ("running in background with ID: X.
  // Output is being written to: P"); its <task-notification> row says when it ended.
  on('session.append', async ($, e, next) => {
    const raw = rowText((e.message as { content?: unknown }).content)

    const started = STARTED.exec(raw)
    if (started) {
      const [, id, path] = started
      const useId = /tool_use_id=(\S+)/.exec(raw)?.[1]
      const call = useId ? labels.get(useId) : undefined
      const server = isServerCommand(call?.command ?? '')
      const job: Job = {
        id,
        path,
        label: call?.label || 'Background job',
        startedAt: await $.clock.now(),
        status: 'running',
        ...(server ? { kind: 'server' as const, port: portOf(call?.command ?? ''), tag: useId } : {}),
      }
      await update($, jobs, list => [...(list ?? []).filter(j => j.id !== id), job].slice(-20))
      void $.ui.open(OPEN)
    }

    const id = /<task-id>([^<]+)<\/task-id>/.exec(raw)?.[1]
    const status = /<status>([^<]+)<\/status>/.exec(raw)?.[1]
    if (id && status) {
      const job = (await read($, jobs))?.find(j => j.id === id)
      if (job && isServer(job)) {
        // A server that stops is gone from the pane; no bloom, no wilt.
        await update($, jobs, list => (list ?? []).filter(j => j.id !== id))
      } else if (job && job.status === 'running') {
        // A job already marked stopped by the TaskStop hook keeps that, with no bloom or wilt.
        await refresh($, job, status)
        const done = (await read($, jobs))?.find(j => j.id === id)
        if (done && !hasProgress(done) && (done.endedAt ?? 0) - done.startedAt < QUICK_MS) {
          await update($, jobs, list => (list ?? []).filter(j => j.id !== id))
        } else if (done) $.ui.toast(`${isBloomed(done) ? '🌸' : '🥀'} ${done.label} ${isBloomed(done) ? 'bloomed' : 'wilted'} ${summary(done)}`.trim())
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = (await read($, jobs)) ?? []
    const now = await $.clock.now()
    const width = Math.max(10, (e.props as { bodyColumns?: number }).bodyColumns ?? 40)
    const barWidth = Math.min(BAR_MAX, Math.max(10, width - 14))

    // Clicks reach buttons on the desktop and the fullscreen terminal; elsewhere press the hotkey while the pane has focus.
    const close = <Button label="Close" role="dismiss" hotkey="x" onPress={() => closePane($)} />

    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No jobs yet.</Text>
          <Text dimColor>Background test, scenario and batch runs show up here.</Text>
          <Box marginTop={1}>{close}</Box>
        </Box>
      )
    }

    const servers = list.filter(isServer)
    const runs = list.filter(j => !isServer(j))

    return (
      <Box flexDirection="column">
        {servers.length ? (
          <Box flexDirection="column" marginBottom={1}>
            {servers.map((job, i) => (
              <Box flexDirection="row" gap={1}>
                <Text wrap="truncate-end">
                  <Text color={LEAF}>🌿 </Text>
                  <Text bold>{job.label}</Text>
                  <Text dimColor>{[job.port ? ` :${job.port}` : '', ` · up ${duration(now - job.startedAt)}`].join('')}</Text>
                </Text>
                {/* Digits so each server's Stop has its own key in the plain terminal. */}
                <Button label="Stop" hotkey={i < 9 ? String(i + 1) : undefined} onPress={async () => {
                    const failure = await stopServer($, job)
                    if (failure) $.ui.toast(`Could not stop ${job.label}: ${failure}`)
                  }} />
              </Box>
            ))}
          </Box>
        ) : null}
        {[...runs].reverse().map(job => {
          const running = job.status === 'running'
          if (!running && !hasProgress(job)) {
            // Finished without ever giving progress: one line, no full bar or bloom to fake.
            // ✓ when it exited cleanly, ✗ otherwise. While running it gets a 0% bar like any job.
            const ok = job.status === 'completed'
            return (
              <Box flexDirection="column" marginBottom={1}>
                <Text wrap="truncate-end">
                  <Text color={running ? PINK : ok ? DEEP_PINK : WILT}>{running ? '● ' : ok ? '✓ ' : '✗ '}</Text>
                  <Text bold>{job.label}</Text>
                  <Text dimColor>{` ${duration((job.endedAt ?? now) - job.startedAt)}${running || ok ? '' : ` · ${job.status}`}`}</Text>
                </Text>
                {running && job.last ? <Text dimColor wrap="truncate-end">› {job.last}</Text> : null}
              </Box>
            )
          }
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
              {/* Shown from the start: an empty bar at 0% until the output gives a count or percentage. */}
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
        <Box flexDirection="row" gap={2}>
          {runs.some(j => j.status !== 'running') ? (
            <Button label="Clear finished" hotkey="c" onPress={() => clearFinished($)} />
          ) : null}
          {close}
        </Box>
      </Box>
    )
  })
}
