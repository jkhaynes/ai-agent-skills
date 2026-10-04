import assert from 'node:assert'
import fs from 'node:fs'
import { parse } from './parse.ts'

// A real PokeJudge run: a loop of three one-scenario evals, each with its own Result line.
const loop = fs.readFileSync(new URL('./fixtures/pokejudge-loop.txt', import.meta.url), 'utf8')
let p = parse(loop)
assert.equal(p.passed, 2); assert.equal(p.failed, 1); assert.equal(p.unit, 'scenarios')
assert.equal(p.last, 'gx-attack-twice · Timing Questions')

// Mid-run, during the second scenario: the pane names it, not "Pacing model calls…".
const mid = loop.split('\n').slice(0, 49).join('\n')
p = parse(mid)
assert.equal(p.last, 'spectator-badges')
assert.equal(p.done, 1); assert.equal(p.total, 3)
assert.equal(p.passed, 0); assert.equal(p.failed, 1)
p = parse(loop.split('\n').slice(0, 60).join('\n'))
assert.equal(p.last, 'spectator-badges · Tournament Procedure')

// A full eval in one process: one Result line at the very end, so count finished blocks live.
const blocks = loop.split('\n').filter(l => !/^=== |^PROGRESS /.test(l))
const one = [
  'Searching across 515 chunks. 3 scenario(s), 1 run(s) each.',
  '--- [weakness-not-applied] Attack Resolution ---',
  '  [PASS] Initial retrieval: ok',
  '  [FAIL] Final Source Support: No ruling was produced to evaluate.',
  '--- [spectator-badges] Tournament Procedure ---',
  '  [PASS] Initial retrieval: ok',
  '  [PASS] Final Source Support: ok',
  '--- [gx-attack-twice] Timing Questions ---',
  '  [Turn 1 retrieved] TCGRULES-appendix-19-pok-mon-gx#0 (0.81)',
].join('\n')
p = parse(one)
assert.equal(p.done, 2); assert.equal(p.total, 3)
assert.equal(p.passed, 1); assert.equal(p.failed, 1)
assert.equal(p.last, 'gx-attack-twice · Timing Questions')
p = parse(one + '\n  [PASS] Final Source Support: ok\n\n--- By category ---\n  Timing Questions: 1/1 passed\n\nResult: 2/3 scenarios fully passed all applicable criteria.\n')
assert.equal(p.passed, 2); assert.equal(p.failed, 1); assert.equal(p.done, 3)
void blocks
console.log('pokejudge checks ok')
