export type Job = {
  id: string
  label: string
  path: string
  startedAt: number
  status: string
  endedAt?: number
  size?: number
  done?: number
  total?: number
  pct?: number
  passed?: number
  failed?: number
  last?: string
}

declare module 'claude-code' {
  interface PluginState {
    'job-progress': { jobs: Job[] }
  }
}
