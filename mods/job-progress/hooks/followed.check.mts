import assert from 'node:assert'
import { isFollowed, isServerCommand } from './classify.ts'

// Runs that should be followed: the runner is the program a step runs.
for (const cmd of [
  'npx vitest run',
  'timeout 500 npx vitest run --passWithNoTests --reporter=dot 2>&1 | tail -15',
  'cd backend && uv run pytest -q -p no:cacheprovider 2>&1 | tail -3',
  'uv run pytest tests/unit -q 2>&1 | tail -6',
  'pytest -q',
  'npm test',
  'npm run test:e2e -- tag-rename tier-deactivation',
  'node --env-file=.dev.vars.e2e node_modules/@playwright/test/cli.js test priority-change role-removal',
  'npx playwright test --project chromium',
  'dotnet test PokeJudge.slnx',
  "$env:PYTHONUNBUFFERED = '1'; dotnet test PokeJudge.slnx",
  'dotnet build -v q && dotnet run --project PokeJudge --no-build -- evaluate --only notes',
  'uv run python tools/attacks.py run baseline-7677564 > .tuning/run2.log 2>&1',
  'PYTHONPATH=. uv run python tests/helpers/make_e2e_fixtures.py 2>&1 | tail -1',
  'gh run watch 36514578724 -R jkhaynes/pricewatch-data --exit-status',
  'gh pr checks 103 --watch --fail-fast',
  'CLOUDFLARE_ACCOUNT_ID=abc timeout 900 node node_modules/wrangler/bin/wrangler.js tail x --format json',
  'go test ./...',
  'dotnet build -v q 2>&1 | head -3 && time (dotnet run --project PokeJudge --no-build -- evaluate --only notes)',
  'cd frontend; for i in 1 2 3; do npx playwright test --reporter=line 2>&1 | tail -2; done',
  'grep -n "kind: \\"" app/adapters/usage.server.ts | grep -v unavailable; npx vitest run tests/unit/usage.test.ts 2>&1 | grep -E "Tests"',
]) assert.ok(isFollowed(cmd), `should follow: ${cmd}`)

// Commands that only mention a runner.
for (const cmd of [
  // The LMI process listing that became a "bloomed" job.
  "$repo = 'loot-membership-integration'; $procs = Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -match 'shopify\.app\.(e2e|bench)\.toml') -or (($_.Name -in 'node.exe','workerd.exe') -and $_.CommandLine -notmatch 'reset\.tmp|playwright|vitest|graphify') }",
  'cat vitest.config.ts',
  'grep -rn "playwright" package.json',
  'grep -rn playwright tests/e2e | head',
  'git log --oneline -- tests/unit/test_grading.py pytest.ini',
  'echo "run npm test next"',
  'ls node_modules/.bin/jest',
  'npm run dev:e2e',
  'gh run list --limit 1',
  'node node_modules/wrangler/bin/wrangler.js tail x',
]) assert.ok(!isFollowed(cmd), `should not follow: ${cmd}`)

assert.ok(isServerCommand('npm run dev:e2e > "C:/tmp/dev.log" 2>&1'))
assert.ok(!isServerCommand("Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'npm run dev' }"))
console.log('followed checks ok')
