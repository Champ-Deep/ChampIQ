// champiq-canvas/apps/web/src/lib/api/workflows.ts
import { req } from './req'
import type { Workflow, Execution, NodeRun } from './types'
export type { Workflow, Execution, NodeRun }

export const listWorkflows  = () => req<Workflow[]>('/api/workflows')
// Workflow body contains React Flow node data — typed at the canvas layer, not here
export const createWorkflow = (body: Record<string, unknown>) =>
  req<Workflow>('/api/workflows', { method: 'POST', body: JSON.stringify(body) })
// Workflow body contains React Flow node data — typed at the canvas layer, not here
export const updateWorkflow = (id: number, body: Record<string, unknown>) =>
  req<Workflow>(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const runWorkflow    = (id: number, payload: Record<string, unknown> = {}) =>
  req<{ execution_id: string; accepted: boolean }>(`/api/workflows/${id}/run`, {
    method: 'POST', body: JSON.stringify(payload)
  })
export const runAdHoc = (nodes: unknown[], edges: unknown[], trigger: Record<string, unknown> = {}) =>
  req<{ execution_id: string; accepted: boolean }>('/api/workflows/ad-hoc/run', {
    method: 'POST', body: JSON.stringify({ nodes, edges, trigger })
  })
export const getExecution = (id: string) => req<Execution>(`/api/executions/${id}`)
export const getNodeRuns  = (execId: string) => req<NodeRun[]>(`/api/executions/${execId}/node_runs`)
