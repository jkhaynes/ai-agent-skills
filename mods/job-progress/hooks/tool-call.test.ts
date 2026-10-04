import { test, expect } from 'claude-code/testing'

// What reaches the shell after job-progress rewrites a call: the test's tool.call hook sits
// beneath the plugin and records the input it was handed.
async function rewrite($: any, on: any, input: Record<string, unknown>) {
  let seen: Record<string, unknown> = {}
  on('tool.call', ($: unknown, e: Record<string, unknown>) => {
    seen = e
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  await $.tool.call(input)
  return seen
}

test('a test runner piped through tail is backgrounded, unpiped and unbuffered', async ($, on) => {
  const e = await rewrite($, on, { tool: 'Bash', command: 'uv run pytest tests/unit -q 2>&1 | tail -6', description: 'Unit tests' })
  expect(e.run_in_background).toBe(true)
  expect(e.command).toBe('export PYTHONUNBUFFERED=1; uv run pytest tests/unit -q 2>&1')
})

test('a mid-chain tail is dropped and the rest of the chain kept', async ($, on) => {
  const e = await rewrite($, on, {
    tool: 'Bash',
    command: 'uv run python tools/attacks.py run x 2>&1 | tail -5 && uv run python tools/attacks.py compare a b > f.txt; head -40 f.txt',
    run_in_background: true,
  })
  expect(e.command).toBe(
    'export PYTHONUNBUFFERED=1; uv run python tools/attacks.py run x 2>&1 && uv run python tools/attacks.py compare a b > f.txt; head -40 f.txt',
  )
})

test('PowerShell gets its own env syntax', async ($, on) => {
  const e = await rewrite($, on, { tool: 'PowerShell', command: 'dotnet test PokeJudge.slnx' })
  expect(e.run_in_background).toBe(true)
  expect(e.command).toBe("$env:PYTHONUNBUFFERED = '1'; dotnet test PokeJudge.slnx")
})

test('an explicit foreground call is left alone', async ($, on) => {
  const fg = await rewrite($, on, { tool: 'Bash', command: 'pytest -q | tail -3', run_in_background: false })
  expect(fg.command).toBe('pytest -q | tail -3')
  expect(fg.run_in_background).toBe(false)
})

test('an ordinary command is left alone', async ($, on) => {
  const plain = await rewrite($, on, { tool: 'Bash', command: 'git log | head -n 3' })
  expect(plain.command).toBe('git log | head -n 3')
  expect(plain.run_in_background).toBeUndefined()
})
