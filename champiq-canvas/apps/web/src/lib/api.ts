import type { ChatMessage, WorkflowPatch } from '@/types'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  getCanvasState: () =>
    req<{ nodes: unknown[]; edges: unknown[]; updated_at: string }>('/api/canvas/state'),
  saveCanvasState: (nodes: unknown[], edges: unknown[]) =>
    req('/api/canvas/state', { method: 'POST', body: JSON.stringify({ nodes, edges }) }),
  getManifests: () => req<Record<string, unknown>[]>('/api/registry/manifests'),
  getToolStatus: (tool: string) =>
    req<{ status: string; tool: string }>(`/api/tools/${tool}/status`),
  getPopulateData: (tool: string, resource: string) =>
    req<unknown[]>(`/api/tools/${tool}/${resource}`),
  runAction: (tool: string, action: string, payload: Record<string, unknown>) =>
    req<{ job_id: string; accepted: boolean; async: boolean }>(
      `/api/tools/${tool}/${action}`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  getJob: (jobId: string) =>
    req<{ job_id: string; status: string; progress: number; result: Record<string, unknown> | null }>(
      `/api/jobs/${jobId}`
    ),

  // --- workflows / executions ---
  listWorkflows: () => req<Record<string, unknown>[]>('/api/workflows'),
  createWorkflow: (body: Record<string, unknown>) =>
    req<Record<string, unknown>>('/api/workflows', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkflow: (id: number, body: Record<string, unknown>) =>
    req<Record<string, unknown>>(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  runWorkflow: (id: number, payload: Record<string, unknown> = {}) =>
    req<{ execution_id: string; accepted: boolean }>(`/api/workflows/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  runAdHoc: (nodes: unknown[], edges: unknown[], trigger: Record<string, unknown> = {}) =>
    req<{ execution_id: string; accepted: boolean }>('/api/workflows/ad-hoc/run', {
      method: 'POST',
      body: JSON.stringify({ nodes, edges, trigger }),
    }),
  getExecution: (id: string) => req<Record<string, unknown>>(`/api/executions/${id}`),
  getNodeRuns: (execId: string) => req<Record<string, unknown>[]>(`/api/executions/${execId}/node_runs`),

  // --- credentials ---
  listCredentials: () => req<Record<string, unknown>[]>('/api/credentials'),
  createCredential: (name: string, type: string, data: Record<string, unknown>) =>
    req<Record<string, unknown>>('/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ name, type, data }),
    }),
  deleteCredential: (id: number) => req(`/api/credentials/${id}`, { method: 'DELETE' }),

  // --- chat ---
  chatHistory: (sessionId = 'default') =>
    req<ChatMessage[]>(`/api/chat/history?session_id=${encodeURIComponent(sessionId)}`),
  chatMessage: (sessionId: string, content: string, currentWorkflow?: Record<string, unknown>) =>
    req<ChatMessage>('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, content, current_workflow: currentWorkflow }),
    }),
}

export type { WorkflowPatch }
