import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'review-board',
  component: 'Pane',
  requestId: 'review-board',
  props: {
    title: 'Review board',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const feature = (over: Record<string, unknown>) => ({
  id: '011-csv-export',
  name: 'CSV export',
  branch: '011-csv-export',
  worktree: null,
  stage: 'Review',
  needsYou: false,
  needsReason: null,
  tasks: { done: 6, total: 6 },
  activity: 'Round 1: 3 of 4 verdicts in',
  round: 1,
  rounds: [{ n: 1, verdicts: { code: 'PASS', ux: 'CHANGES' }, fixes: false }],
  verdicts: { code: 'PASS', ux: 'CHANGES' },
  decision: null,
  files: ['spec.md', 'reviews/round-1/review-ux.md'],
  ci: { state: 'pending', label: 'CI pending' },
  ...over,
})

const SEED: Record<string, unknown> = {
  status: {
    shape: 'status-1',
    value: {
      board: {
        repo: 'back-room',
        root: '/r',
        base: 'master',
        panel: [{ lens: 'code', name: 'reviewer-code', model: 'sonnet' }],
        designSystem: null,
        features: [
          feature({}),
          feature({ id: '012-alerts', name: 'Alerts', stage: 'Decision', needsYou: true, needsReason: 'Approver escalated' }),
          feature({ id: '003-card-list', name: 'Card list', stage: 'Merged' }),
        ],
        generatedAt: '2026-11-14T10:00:00',
      },
      error: null,
      at: 1,
    },
  },
  agents: {
    shape: 'agents-1',
    value: [{ id: 'a1', type: 'reviewer-ux', description: 'Review round 1', startedAt: 0, status: 'running' }],
  },
}

test('the pane shows the board and running subagents, on every surface', async ($, on) => {
  on('state.get', async ($, e, next) => {
    const seed = SEED[e.key]
    return seed ? { value: { value: seed, version: 1 } } : next(e)
  })
  on('clock.now', () => ({ value: 65000 }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /back-room · master · 3 features/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /1 running/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /reviewer-ux/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /DECISION · 1/ }))).toBeTruthy()
    // Merged features are hidden until asked for.
    expect(await ui.find({ type: 'Text', text: /Card list/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('the script runs only while the pane is shown, at most every 15s', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let shown = false
  let runs = 0
  on('command.register', () => ({ value: { command: 'board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({
    value: shown ? [{ id: 'review-board', title: 'Review board', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  // poll's first step: count it, and say there is no script so nothing else runs.
  on('fs.exists', () => {
    runs++
    return { value: false }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const startRuns = runs // session.start checks for the script once to decide whether to open

  await clock.advance(60_000)
  expect(runs).toBe(startRuns) // closed: nothing ran

  shown = true
  await clock.advance(2_000)
  expect(runs).toBe(startRuns + 1) // came into view: runs at once

  await clock.advance(10_000)
  expect(runs).toBe(startRuns + 1) // not yet 15s

  await clock.advance(6_000)
  expect(runs).toBe(startRuns + 2)

  shown = false
  await clock.advance(60_000)
  expect(runs).toBe(startRuns + 2) // hidden again: nothing ran
})
