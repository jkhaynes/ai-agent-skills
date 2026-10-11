import { test, expect } from 'claude-code/testing'

const PINK = '#e8b4d0'
const DONE = '#a6d9a8'
const UPSTREAM = ['#8f8cf4', '#5fbf8f', '#D97757']

const report = ($: any, input: Record<string, unknown>) =>
  $.tool.call({ tool: 'mcp__savvy-progress__progress', ...input })

// The desktop band is one SVG; its source carries the bar's fill colour.
const bandSvg = async ($: any): Promise<string> => {
  const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: 100 } })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return String(svg?.props.source ?? '')
}

test('the desktop bar is pink while a flow runs and green once it finishes', async $ => {
  await report($, { title: 'Phase 2', total: 4, done: 1, phase: 'delegate' })
  const running = await bandSvg($)
  expect(running).toContain(`fill="${PINK}"`)
  for (const colour of UPSTREAM) expect(running).not.toContain(colour)

  await report($, { done: 4, finished: true })
  const finished = await bandSvg($)
  expect(finished).toContain(`fill="${DONE}"`)
  expect(finished).not.toContain(`fill="${PINK}"`)
})
