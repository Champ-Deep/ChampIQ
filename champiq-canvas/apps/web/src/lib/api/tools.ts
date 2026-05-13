// champiq-canvas/apps/web/src/lib/api/tools.ts
import { req } from './req'
import type { ToolJob } from './types'
import type { ChampIQManifest } from '@/types'
export type { ToolJob }

export const getManifests    = () => req<ChampIQManifest[]>('/api/registry/manifests')
export const getToolStatus   = (tool: string) =>
  req<{ status: string; tool: string }>(`/api/tools/${tool}/status`)
export const getPopulateData = (tool: string, resource: string) =>
  req<unknown[]>(`/api/tools/${tool}/${resource}`)
export const runAction       = (tool: string, action: string, payload: Record<string, unknown>) =>
  req<{ job_id: string; accepted: boolean; async: boolean }>(
    `/api/tools/${tool}/${action}`, { method: 'POST', body: JSON.stringify(payload) }
  )
export const getJob = (jobId: string) => req<ToolJob>(`/api/jobs/${jobId}`)
