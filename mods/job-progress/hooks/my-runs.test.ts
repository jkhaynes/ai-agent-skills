import { test, expect } from 'claude-code/testing'

// The test stands in for the engine beneath the plugin: the shell (recording what job-progress
// hands it), and the clock. Registered before the test's first call on $.
function engine(on: any) {
  const shell: Record<string, unknown>[] = []
  on('tool.call', ($: unknown, e: Record<string, unknown>) => {
    shell.push(e)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('clock.now', () => ({ value: 0 }))
  return shell
}

test('a PokeJudge eval is backgrounded', async ($, on) => {
  const shell = engine(on)
  await $.tool.call({ tool: 'Bash', command: 'dotnet run --project PokeJudge --no-build -- evaluate --only notes' } as any)
  expect(shell[0]?.run_in_background).toBe(true)
})

test('a ten-or-not attack sweep and a CI watch are backgrounded', async ($, on) => {
  const shell = engine(on)
  await $.tool.call({ tool: 'Bash', command: 'uv run python tools/attacks.py run baseline-7677564' } as any)
  await $.tool.call({ tool: 'Bash', command: 'gh pr checks 103 --watch --fail-fast' } as any)
  expect(shell.map(e => e.run_in_background)).toEqual([true, true])
})

test('a long sleep runs when no job is running', async ($, on) => {
  const shell = engine(on)
  await $.tool.call({ tool: 'Bash', command: 'sleep 90; gh run list --limit 1' } as any)
  expect(shell[0]?.command).toBe('sleep 90; gh run list --limit 1')
})

test('a background dev server is marked for stopping; a test run is not', async ($, on) => {
  const shell = engine(on)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev:e2e', run_in_background: true } as any)
  await $.tool.call({ tool: 'Bash', command: 'npm run test:e2e' } as any)
  expect(String(shell[0]?.command)).toMatch(/^export JOB_PROGRESS_TAG=\S+; export PYTHONUNBUFFERED=1; npm run dev:e2e$/)
  expect(shell[1]?.command).toBe('export PYTHONUNBUFFERED=1; npm run test:e2e')
})

test("a TaskStop for a task the pane isn't following reaches the engine untouched", async ($, on) => {
  const shell = engine(on)
  await $.tool.call({ tool: 'TaskStop', task_id: 'bzzz9999' } as any)
  expect(shell).toEqual([expect.objectContaining({ tool: 'TaskStop', task_id: 'bzzz9999' })])
})
