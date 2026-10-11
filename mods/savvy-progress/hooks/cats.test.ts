import { test, expect, mock } from 'claude-code/testing'

const NOSE = 'fill="#c46a8e"'
// Upstream's crab: its left claw, a 4×4 block at the body's side.
const CLAW = '<rect x="3" y="14" width="4" height="4"'

// One agent per costume, with the collar colour its role or tier should wear.
const AGENTS: [description: string, subagentType: string, collar: string][] = [
  ['Implement Task 1: Add parser', 'general-purpose', '#e8c48f'],
  ['Review Task 1 (spec + quality)', 'general-purpose', '#f0a58f'],
  ['Review code changes', 'general-purpose', '#f5a8c8'],
  ['Cook the omelette', 'savvy-medium', '#9fc3e8'],
  ['Race the flag', 'savvy-light', '#a6d9b8'],
  ['Look up the config loader', 'Explore', '#b39ca8'],
  ['Something else', 'general-purpose', '#b39ca8'],
]

test('every agent in the panel is drawn as a cat in its role-coloured collar, not a crab', async ($: any, on) => {
  let n = 0
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ agentId: `agent-${++n}`, model: 'claude-opus-5-5' }))
  for (const [description, subagentType] of AGENTS) await $.agent.spawn({ prompt: 'brief', description, subagentType })

  const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: { bodyColumns: 100 } })
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()

  for (const [description, , collar] of AGENTS) {
    const source = String(svgs.find((s: any) => String(s.props.alt).startsWith(description))?.props.source ?? '')
    expect(source).toContain(NOSE)
    expect(source).toContain(`<rect x="9" y="14" width="12" height="1" fill="${collar}"/>`)
    expect(source).not.toContain(CLAW)
  }
})
