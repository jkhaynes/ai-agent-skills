import assert from 'node:assert'
import { isFollowed, isServerCommand, killResult, portOf, rowKind, serversToStop, sleepDenial, stopFailure, tagCommand } from './classify.ts'

// Only test runs and PokeJudge case runs are followed.
assert.ok(isFollowed('dotnet run --project PokeJudge --no-build -- evaluate --only notes'))
assert.ok(isFollowed('npm run test:e2e -- tag-rename'))
assert.ok(!isFollowed('uv run python tools/attacks.py run baseline-7677564'))
assert.ok(!isFollowed('gh pr checks 103 --watch --fail-fast'))
assert.ok(!isFollowed('timeout 900 node node_modules/wrangler/bin/wrangler.js tail loot-membership-integration-production'))
assert.ok(!isFollowed('npm run bench'))
assert.ok(!isFollowed('gh run list --limit 1'))

// Which background tasks get a row in the pane.
assert.equal(rowKind('npm run test:e2e'), 'job')
assert.equal(rowKind('uv run pytest tests/integration -q'), 'job')
assert.equal(rowKind('dotnet test PokeJudge.slnx'), 'job')
assert.equal(rowKind('dotnet run --project PokeJudge --no-build -- evaluate --only notes'), 'job')
assert.equal(rowKind('npm run dev:e2e'), 'server')
assert.equal(rowKind('uv run python tools/attacks.py run baseline-7677564'), undefined)
assert.equal(rowKind('gh pr checks 103 --watch'), undefined)
assert.equal(rowKind('npm run build'), undefined)
assert.equal(rowKind(undefined), undefined)

assert.ok(isServerCommand('npm run dev:e2e > "C:/tmp/dev.log" 2>&1'))
assert.ok(isServerCommand('npm run bench:serve'))
assert.ok(isServerCommand('npx wrangler dev --port 8787'))
assert.ok(!isServerCommand('npm run test:e2e'))
assert.ok(!isServerCommand('npx vite build'))
assert.equal(portOf('npx wrangler dev --port 8787'), 8787)
assert.equal(portOf('  ➜  Local:   http://localhost:3457/'), 3457)

const e2e = { id: 'b1', label: 'Run the full e2e suite', path: '', startedAt: 0, status: 'running' }
const server = { ...e2e, id: 's1', label: 'dev server', kind: 'server' as const }
assert.match(sleepDenial('sleep 480; cat C:/tmp/b1.output', [e2e]) ?? '', /"Run the full e2e suite" is still running/)
assert.equal(sleepDenial('sleep 5; curl localhost:3457', [e2e]), undefined)
assert.equal(sleepDenial('sleep 480', []), undefined)
assert.equal(sleepDenial('sleep 480', [server]), undefined)
assert.equal(sleepDenial('sleep 480', [{ ...e2e, status: 'completed' }]), undefined)
assert.ok(sleepDenial('Start-Sleep -Seconds 120; Get-Content x', [e2e]))

// /progress stop [n]
const bench = { ...server, id: 's2', label: 'bench server' }
assert.deepEqual((serversToStop([e2e, server, bench], '') as any[]).map(j => j.id), ['s1', 's2'])
assert.deepEqual((serversToStop([e2e, server, bench], '2') as any[]).map(j => j.id), ['s2'])
assert.match(serversToStop([e2e, server], '3') as string, /no server 3/)
assert.match(serversToStop([e2e, server], 'x') as string, /no server x/)
assert.equal(serversToStop([e2e], ''), 'No dev servers are running.')
assert.equal(serversToStop([{ ...server, status: 'killed' }], ''), 'No dev servers are running.')

// What TaskStop answered a plugin's call: undefined when it stopped, else why not.
assert.equal(stopFailure({ result: { message: 'Successfully stopped task: b1' } }), undefined)
assert.equal(stopFailure({ deny: 'TaskStop is not allowed here' }), 'TaskStop is not allowed here')
assert.equal(stopFailure({ result: {}, isError: true, text: 'No task found with ID: b1' }), 'No task found with ID: b1')
assert.equal(stopFailure({ result: {}, isError: true }), 'TaskStop returned an error')

// Marking a server so a stop can find its whole process tree.
assert.equal(tagCommand('Bash', 'npm run dev:e2e', 'toolu_1'), 'export JOB_PROGRESS_TAG=toolu_1; npm run dev:e2e')
assert.equal(tagCommand('PowerShell', 'npm run dev', 'toolu_2'), "$env:JOB_PROGRESS_TAG = 'toolu_2'; npm run dev")
assert.deepEqual(killResult('killed 2 left 0\n'), { killed: 2, left: 0 })
assert.equal(killResult(''), undefined)
console.log('classify checks ok')
