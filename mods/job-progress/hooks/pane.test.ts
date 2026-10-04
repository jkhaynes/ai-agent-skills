import { test, expect } from 'claude-code/testing'

// The test stands in for the engine's pane record: ui.open adds, ui.close removes, ui.panes lists.
function fakePanes(on: any) {
  const open = new Set<string>()
  on('ui.open', ($: unknown, e: { id: string }) => (open.add(e.id), { isPlaced: true }))
  on('ui.close', ($: unknown, e: { id: string }) => void open.delete(e.id))
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  on('command.run', () => ({ text: '' }))
  return open
}

const run = ($: any, args: string) => $.command.run({ command: 'progress', args })

test('/progress toggles the pane', async ($, on) => {
  const open = fakePanes(on)
  await run($, '')
  expect(open.has('job-progress')).toBe(true)
  await run($, '')
  expect(open.has('job-progress')).toBe(false)
})

test('/progress close closes it and leaves a closed pane closed', async ($, on) => {
  const open = fakePanes(on)
  await run($, '')
  await run($, 'close')
  expect(open.has('job-progress')).toBe(false)
  await run($, 'close')
  expect(open.has('job-progress')).toBe(false)
})

test('/progress stop with no servers says so and stops nothing', async ($, on) => {
  const stopped: unknown[] = []
  on('tool.call', ($: unknown, e: unknown) => (stopped.push(e), { result: {} }))
  fakePanes(on)
  const ran: any = await run($, 'stop')
  expect(ran.text).toBe('No dev servers are running.')
  expect(stopped.length).toBe(0)
})
