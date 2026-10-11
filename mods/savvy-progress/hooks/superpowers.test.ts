import { test, expect, mock } from 'claude-code/testing'

// Descriptions as superpowers' subagent-driven-development prompts spell them.
const IMPLEMENT = (n: number, name = 'Add parser') => `Implement Task ${n}: ${name}`
const REVIEW = (n: number) => `Review Task ${n} (spec + quality)`
const RE_REVIEW = (n: number, r: number) => `Re-review Task ${n} fix round ${r}`
const FINAL = 'Review code changes'

// The test's hooks stand for the engine: each spawn gets a fresh agent id.
function engine(on: any) {
  let n = 0
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  // The engine's own band, drawn when no plugin has a bar to show.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('agent.spawn', () => ({ agentId: `agent-${++n}`, model: 'claude-opus-5-5' }))
  on('turn.complete', () => ({ text: '' }))
}

const spawn = async ($: any, description: string, subagentType = 'general-purpose'): Promise<string> =>
  (await $.agent.spawn({ prompt: 'brief', description, subagentType })).agentId

const finish = ($: any, agentId: string, reason = 'answer') =>
  $.turn.complete({ agentId, reason, answer: 'ok', durationMs: 1, isAborted: reason === 'aborted', turnId: `t-${agentId}` })

const paneLines = async ($: any): Promise<string[]> => {
  const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: { bodyColumns: 100 } })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)
  await ui.unmount()
  return texts
}

// The line under an agent's title: "<role or type> · <model>[ · round N]".
const metaOf = (lines: string[], description: string): string => {
  const i = lines.findIndex(l => l.includes(description))
  return i < 0 ? '' : (lines.slice(i + 1).find(l => l.includes('·')) ?? '').trim()
}

const bandSvg = async ($: any): Promise<string | undefined> => {
  const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: 100 } })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return svg === undefined ? undefined : String(svg.props.source)
}

test('superpowers dispatches get a role from their description; other agents keep their type', async ($, on) => {
  engine(on)
  await spawn($, IMPLEMENT(1))
  await spawn($, REVIEW(1))
  await spawn($, FINAL)
  await spawn($, 'Look up the config loader')

  const lines = await paneLines($)
  expect(metaOf(lines, IMPLEMENT(1))).toMatch(/^implement · /)
  expect(metaOf(lines, REVIEW(1))).toMatch(/^review · /)
  expect(metaOf(lines, FINAL)).toMatch(/^final review · /)
  expect(metaOf(lines, 'Look up the config loader')).toMatch(/^general-purpose · /)
})

test('a re-review counts as the next round of its own task, not of other tasks or roles', async ($, on) => {
  engine(on)
  await spawn($, IMPLEMENT(2))
  await spawn($, REVIEW(2))
  await spawn($, RE_REVIEW(2, 1))
  await spawn($, REVIEW(3))

  const lines = await paneLines($)
  expect(metaOf(lines, RE_REVIEW(2, 1))).toMatch(/round 2$/)
  expect(metaOf(lines, REVIEW(2))).not.toMatch(/round/)
  expect(metaOf(lines, IMPLEMENT(2))).not.toMatch(/round/)
  expect(metaOf(lines, REVIEW(3))).not.toMatch(/round/)
})

test('an Implement Task dispatch starts the bar; the next task marks the last one accepted; the final review closes it', async ($, on) => {
  engine(on)
  await spawn($, 'Look up the config loader')
  await spawn($, FINAL)
  expect(await bandSvg($)).toBeUndefined()

  const one = await spawn($, IMPLEMENT(1))
  expect(await bandSvg($)).toContain('superpowers')
  await finish($, one)
  await finish($, await spawn($, REVIEW(1)))

  await spawn($, IMPLEMENT(2, 'Wire CLI'))
  expect(await bandSvg($)).toContain('1 accepted')

  const final = await spawn($, FINAL)
  expect(await bandSvg($)).toContain('2 accepted')
  await finish($, final)
  expect(await bandSvg($)).toContain('>Done<')
})

test('a reported plan gives the bar its total and matches runs to planned tasks by task number', async ($: any, on) => {
  engine(on)
  await $.tool.call({
    tool: 'mcp__savvy-progress__progress',
    title: 'Parser',
    phase: 'delegate',
    tasks: [
      { title: IMPLEMENT(1), tier: 'implement' },
      { title: IMPLEMENT(2, 'Wire CLI'), tier: 'implement' },
      { title: IMPLEMENT(3, 'Docs'), tier: 'implement' },
    ],
  })
  await spawn($, 'Implement Task 1: add the parser module')
  await spawn($, IMPLEMENT(2, 'Wire the CLI'))

  const lines = await paneLines($)
  expect(lines.some(l => l.includes('1. Implement Task 1'))).toBe(false)
  expect(lines.some(l => l.includes('2. Implement Task 2'))).toBe(false)
  expect(lines.some(l => l.includes('3. Implement Task 3: Docs'))).toBe(true)
  expect(await bandSvg($)).toContain('1/3')
})
