/** A PR's CI summary, as scripts/dashboard.py's ci_summary makes it. */
export type Ci = { state: string; label: string; number?: number; url?: string }

export type Round = { n: number; verdicts: Record<string, string>; fixes: boolean }

/** One feature, as `scripts/dashboard.py --json` prints it. */
export type Feature = {
  id: string
  name: string
  branch: string | null
  worktree: string | null
  stage: 'Design' | 'Build' | 'Review' | 'Decision' | 'Merged'
  needsYou: boolean
  needsReason: string | null
  tasks: { done: number; total: number } | null
  activity: string
  round: number
  rounds: Round[]
  verdicts: Record<string, string>
  decision: { verdict: 'APPROVE' | 'ESCALATE'; why: string; forOwner: string } | null
  files: string[]
  ci: Ci
}

export type Board = {
  repo: string
  root: string
  base: string
  panel: { lens: string; name: string; model: string }[]
  designSystem: { version: number } | null
  features: Feature[]
  generatedAt: string
}

/** The last poll: the board, or why there is none. */
export type BoardStatus = { board: Board | null; error: string | null; at: number }

/** A subagent this session started, from agent.spawn to its turn.complete. */
export type Agent = {
  id: string
  type: string
  description: string
  model?: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'failed'
}

export type FileView = { id: string; path: string; text: string } | null

declare module 'claude-code' {
  interface PluginState {
    'review-board': {
      status: Shaped<BoardStatus>
      ci: Shaped<Record<string, Ci>>
      agents: Shaped<Agent[]>
      file: Shaped<FileView>
      selected: string | null
      needsOnly: boolean
      showMerged: boolean
    }
  }
}
