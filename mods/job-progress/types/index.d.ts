export type Job = {
  id: string
  label: string
  path: string
  startedAt: number
  status: string
  /** A dev server: no bar, no bloom or wilt, a Stop button. */
  kind?: 'job' | 'server'
  /** The marker its shell's command line carries, for stopping the whole process tree. */
  tag?: string
  port?: number
  endedAt?: number
  size?: number
  done?: number
  total?: number
  pct?: number
  passed?: number
  failed?: number
  unit?: string
  last?: string
}

declare module 'claude-code' {
  interface PluginState {
    'job-progress': { jobs: Job[] }
  }
}
