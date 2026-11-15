import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Board, BoardStatus, Ci, Feature, FileView } from '../types'

// The review panel board, drawn in a pane. Its data is the project's own
// scripts/dashboard.py, run once per poll with --json, so the browser
// dashboard and this pane always agree. Subagents come from this session's
// own agent.spawn and turn.complete events.

const PANE = 'review-board'
const TITLE = 'Review board'
const SCRIPT = 'scripts/dashboard.py'
// The script runs only while the pane is open and shown: at most every
// POLL_MS, and at once when the pane comes back into view. The visibility
// check itself is cheap (no process), so it runs more often.
const POLL_MS = 15000
const CHECK_MS = 2000
const CI_MS = 60000

const status = atom({ plugin: 'review-board', key: 'status' } as const, { board: null, error: null, at: 0 } as BoardStatus, {
  shape: 'status-1',
})
const ciMap = atom({ plugin: 'review-board', key: 'ci' } as const, {} as Record<string, Ci>, { shape: 'ci-1' })
const agents = atom({ plugin: 'review-board', key: 'agents' } as const, [] as Agent[], { shape: 'agents-1' })
const fileView = atom({ plugin: 'review-board', key: 'file' } as const, null as FileView, { shape: 'file-1' })
const selected = atom({ plugin: 'review-board', key: 'selected' } as const, null as string | null)
const needsOnly = atom({ plugin: 'review-board', key: 'needsOnly' } as const, false)
const showMerged = atom({ plugin: 'review-board', key: 'showMerged' } as const, false)

// Palette from the dashboard mockup: deep navy, soft pink accent.
const C = {
  accent: '#e6a9bc',
  accentSoft: '#f3c9d6',
  text: '#eef1f8',
  muted: '#aab5cf',
  faint: '#8995b2',
  green: '#a9dbb5',
  amber: '#f2c784',
  rose: '#f4a3b4',
  panel: '#19243f',
  raised: '#22304f',
  border: '#34426a',
}
const STAGES: Feature['stage'][] = ['Design', 'Build', 'Review', 'Decision', 'Merged']
const VERDICT_COLOR: Record<string, string> = { PASS: C.green, CHANGES: C.amber, SKIPPED: C.faint, pending: C.muted }
const CI_COLOR: Record<string, string> = { green: C.green, merged: C.green, pending: C.amber, red: C.rose }

// Module-local, so a reload starts them over; they only guard overlapping runs.
let python: string | null = null
let polling = false
let lastCi = 0
let lastPoll = 0
let wasVisible = false

async function paneVisible($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced && p.isShown)
  } catch {
    return false
  }
}

async function tick($: EngineInterface) {
  const visible = await paneVisible($)
  const cameBack = visible && !wasVisible
  wasVisible = visible
  if (!visible) return
  const now = await $.clock.now()
  if (cameBack || now - lastPoll >= POLL_MS) await poll($)
}

async function findPython($: EngineInterface): Promise<string | null> {
  if (python) return python
  for (const exe of ['python', 'python3', 'py']) {
    try {
      const r = await $.process.run([exe, '--version'], { timeoutMs: 10000 })
      if (r.exitCode === 0 && /Python 3/.test(r.stdout + r.stderr)) return (python = exe)
    } catch {
      // not on PATH; try the next
    }
  }
  return null
}

async function hasScript($: EngineInterface): Promise<boolean> {
  return $.fs.exists(SCRIPT).catch(() => false)
}

async function runScript($: EngineInterface, args: string[], stdin?: string, timeoutMs = 30000) {
  const exe = await findPython($)
  if (!exe) throw new Error('Python 3 is not on PATH')
  return $.process.run([exe, SCRIPT, ...args], { stdin, timeoutMs, env: { PYTHONIOENCODING: 'utf-8' } })
}

function explain(stderr: string): string {
  if (/unrecognized arguments/.test(stderr))
    return `This repo's ${SCRIPT} predates --json. Copy scripts/dashboard.py from project-template.`
  return stderr.trim().split('\n').pop() || 'dashboard.py failed'
}

async function poll($: EngineInterface) {
  if (polling) return
  polling = true
  lastPoll = await $.clock.now().catch(() => 0)
  try {
    if (!(await hasScript($))) {
      const at0 = await $.clock.now()
      await update($, status, () => ({ board: null, error: `No ${SCRIPT} in this folder.`, at: at0 }))
      return
    }
    const now = await $.clock.now()
    if (now - lastCi > CI_MS) {
      lastCi = now
      const r = await runScript($, ['--ci-json'], undefined, 120000).catch(() => null)
      if (r && r.exitCode === 0) {
        try {
          const map = JSON.parse(r.stdout) as Record<string, Ci>
          await update($, ciMap, () => map)
        } catch {
          // keep the last CI map
        }
      }
    }
    const ci = await read($, ciMap)
    const r = await runScript($, ['--json'], JSON.stringify(ci))
    const at = await $.clock.now()
    if (r.exitCode !== 0) {
      const prev = await read($, status)
      await update($, status, () => ({ board: prev.board, error: explain(r.stderr), at }))
      return
    }
    const board = JSON.parse(r.stdout) as Board
    await update($, status, () => ({ board, error: null, at }))
  } catch (err) {
    const prev = await read($, status)
    const at1 = await $.clock.now()
    await update($, status, () => ({ board: prev.board, error: String(err), at: at1 }))
  } finally {
    polling = false
  }
}

async function openFile($: EngineInterface, id: string, path: string) {
  const r = await runScript($, ['--file', id, path]).catch(() => null)
  const text = r && r.exitCode === 0 ? r.stdout : `Could not read ${path}.`
  await update($, fileView, () => ({ id, path, text }))
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function clock(ms: number): string {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: 'Open the review board pane (features, reviews, CI, subagents)' })
    $.clock.every(CHECK_MS, () => void tick($))
    if (await hasScript($)) void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void poll($)
    return { text: 'Review board opened.' }
  })

  // Subagents: started here, ended at their own turn.complete.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if ('agentId' in r && r.agentId) {
      const agent: Agent = {
        id: r.agentId,
        type: e.subagentType,
        description: e.description,
        model: r.model,
        startedAt: await $.clock.now(),
        status: 'running',
      }
      await update($, agents, list => [...list.filter(a => a.id !== agent.id), agent].slice(-30))
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      const endedAt = await $.clock.now()
      const ended: Agent['status'] =
        e.reason === 'refusal' || e.reason === 'error' || e.reason === 'aborted' ? 'failed' : 'done'
      await update($, agents, list =>
        list.map(a => (a.id === id && a.status === 'running' ? { ...a, endedAt, status: ended } : a)),
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Progress, Markdown } = $.ui.resolve(e)
    const st = await read($, status)
    const list = await read($, agents)
    const file = await read($, fileView)
    const sel = await read($, selected)
    const onlyNeeds = await read($, needsOnly)
    const merged = await read($, showMerged)
    const board = st.board
    const now = await $.clock.now()
    const running = list.filter(a => a.status === 'running')
    const needs = board ? board.features.filter(f => f.needsYou) : []

    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="column">
          <Text color={needs.length ? C.accent : C.muted} bold>
            {needs.length} need{needs.length === 1 ? 's' : ''} you
          </Text>
          <Text color={C.muted}>{running.length} subagent{running.length === 1 ? '' : 's'} running</Text>
        </Box>
      )
    }

    // A file opened from a feature's detail takes the whole pane until Back.
    if (file) {
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text mono color={C.muted} wrap="truncate-start">
              {file.id}/{file.path}
            </Text>
            <Button key="back" hotkey="b" onPress={() => update($, fileView, () => null)}>
              Back
            </Button>
          </Box>
          <Markdown text={file.path.endsWith('.md') ? file.text : '```\n' + file.text + '\n```'} />
        </Box>
      )
    }

    const chip = (lens: string, v: string) => (
      <Text color={VERDICT_COLOR[v] ?? C.muted}>
        {lens}·{v === 'pending' ? '…' : v}{' '}
      </Text>
    )

    const agentRow = (a: Agent) => (
      <Box key={`agent-${a.id}`} flexDirection="row" justifyContent="space-between" gap={1}>
        <Text wrap="truncate-end" dimColor={a.status !== 'running'}>
          <Text color={a.status === 'running' ? C.accent : a.status === 'failed' ? C.rose : C.green}>
            {a.status === 'running' ? '● ' : a.status === 'failed' ? '✕ ' : '✓ '}
          </Text>
          <Text bold>{a.type}</Text> {a.description}
        </Text>
        <Text color={C.faint} tabular>
          {ago((a.endedAt ?? now) - a.startedAt)}
        </Text>
      </Box>
    )

    const featureCard = (f: Feature) => {
      const isSel = f.id === sel
      return (
        <Box
          key={`f-${f.id}`}
          flexDirection="column"
          borderStyle="round"
          borderColor={isSel ? C.accent : f.needsYou ? C.accentSoft : C.border}
          paddingX={1}
        >
          <Button key={`pick-${f.id}`} plain onPress={() => update($, selected, s => (s === f.id ? null : f.id))}>
            <Text mono color={C.faint}>
              {f.id.slice(0, 3)}{' '}
            </Text>
            <Text bold>{f.name}</Text>
            {f.needsYou ? <Text color={C.accent}> · needs you</Text> : ''}
          </Button>
          {f.tasks && f.stage === 'Build' ? (
            <Progress label="tasks.md" value={f.tasks.done} max={f.tasks.total} valueText={`${f.tasks.done} / ${f.tasks.total}`} color={C.accent} />
          ) : null}
          <Text color={C.muted} wrap="wrap">
            {f.activity}
          </Text>
          {Object.keys(f.verdicts).length && f.stage !== 'Merged' ? (
            <Text wrap="wrap">{Object.entries(f.verdicts).map(([l, v]) => chip(l, v))}</Text>
          ) : null}
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={C.faint}>{f.round ? `Round ${f.round} of 3` : f.stage}</Text>
            <Text color={CI_COLOR[f.ci.state] ?? C.faint} bold>
              {f.ci.label}
            </Text>
          </Box>
          {isSel ? detail(f) : null}
        </Box>
      )
    }

    const detail = (f: Feature) => (
      <Box flexDirection="column" gap={1} marginTop={1}>
        {f.branch ? (
          <Text mono color={C.faint} wrap="truncate-end">
            {f.branch}
            {f.worktree ? `  ${f.worktree}` : ''}
          </Text>
        ) : null}
        {f.needsReason ? <Text color={C.accent}>{f.needsReason}</Text> : null}
        {f.decision ? (
          <Box flexDirection="column">
            <Text bold color={f.decision.verdict === 'APPROVE' ? C.green : C.rose}>
              {f.decision.verdict}
            </Text>
            {f.decision.why ? <Text wrap="wrap">{f.decision.why.split('\n')[0]}</Text> : null}
            {f.decision.forOwner ? <Text color={C.accentSoft} wrap="wrap">For you: {f.decision.forOwner.split('\n')[0]}</Text> : null}
          </Box>
        ) : null}
        {f.rounds.length ? (
          <Box flexDirection="column">
            <Text color={C.muted} bold>
              REVIEW ROUNDS
            </Text>
            {f.rounds.map(r => (
              <Text key={`r-${f.id}-${r.n}`} wrap="wrap">
                <Text color={C.muted}>Round {r.n}  </Text>
                {Object.entries(r.verdicts).map(([l, v]) => chip(l, v))}
                {r.fixes ? <Text color={C.faint}>· fixes.md</Text> : ''}
              </Text>
            ))}
          </Box>
        ) : null}
        {f.ci.url ? <Text color={C.faint}>PR #{f.ci.number}: {f.ci.url}</Text> : null}
        <Box flexDirection="column">
          <Text color={C.muted} bold>
            FILES
          </Text>
          {f.files
            .filter(p => !p.startsWith('mockup/'))
            .slice(0, 40)
            .map(p => (
              <Button key={`file-${f.id}-${p}`} plain onPress={() => openFile($, f.id, p)}>
                <Text mono>{p}</Text>
              </Button>
            ))}
        </Box>
      </Box>
    )

    const visible = board
      ? board.features.filter(f => (!onlyNeeds || f.needsYou) && (merged || f.stage !== 'Merged' || f.id === sel))
      : []
    const mergedCount = board ? board.features.filter(f => f.stage === 'Merged').length : 0

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold color={C.text}>
            {board ? `${board.repo} · ${board.base} · ${board.features.length} features` : 'Review board'}
          </Text>
          <Text color={st.error ? C.rose : C.faint} wrap="wrap">
            {st.error ?? (st.at ? `Live · updated ${clock(st.at)}` : 'Loading…')}
          </Text>
        </Box>

        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="needs" hotkey="n" variant={onlyNeeds ? 'primary' : 'secondary'} onPress={() => update($, needsOnly, v => !v)}>
            Needs you · {needs.length}
          </Button>
          <Button key="merged" hotkey="m" onPress={() => update($, showMerged, v => !v)}>
            {merged ? 'Hide merged' : `Merged · ${mergedCount}`}
          </Button>
          <Button key="refresh" hotkey="r" onPress={() => poll($)}>
            Refresh
          </Button>
        </Box>

        <Box flexDirection="column">
          <Text color={C.muted} bold>
            SUBAGENTS · {running.length} running
          </Text>
          {list.length === 0 ? <Text color={C.faint}>None started in this session yet.</Text> : null}
          {[...running, ...list.filter(a => a.status !== 'running').reverse().slice(0, 6)].map(agentRow)}
          {list.some(a => a.status !== 'running') ? (
            <Button key="clear-agents" plain onPress={() => update($, agents, l => l.filter(a => a.status === 'running'))}>
              <Text color={C.faint}>clear finished</Text>
            </Button>
          ) : null}
        </Box>

        {board && board.panel.length ? (
          <Text wrap="wrap">
            <Text color={C.muted} bold>
              PANEL{' '}
            </Text>
            {board.panel.map(p => (
              <Text>
                <Text color={C.accent}>● </Text>
                {p.lens} <Text color={C.faint}>{p.model}</Text>
                {'  '}
              </Text>
            ))}
          </Text>
        ) : null}

        {STAGES.map(stage => {
          const cards = visible.filter(f => f.stage === stage)
          if (!cards.length) return null
          return (
            <Box key={`stage-${stage}`} flexDirection="column">
              <Text color={C.muted} bold>
                {stage.toUpperCase()} · {cards.length}
              </Text>
              {cards.map(featureCard)}
            </Box>
          )
        })}
        {board && !visible.length ? <Text color={C.faint}>{onlyNeeds ? 'Nothing needs you.' : 'No active features.'}</Text> : null}
      </Box>
    )
  })
}
