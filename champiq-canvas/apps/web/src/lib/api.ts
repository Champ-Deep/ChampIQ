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
    req<{ status: string; tool: string }>(`/api/${tool}/status`),
  getPopulateData: (tool: string, resource: string) =>
    req<unknown[]>(`/api/${tool}/${resource}`),
  runAction: (tool: string, action: string, payload: Record<string, unknown>) =>
    req<{ job_id: string; accepted: boolean; async: boolean }>(
      `/api/${tool}/${action}`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  getJob: (jobId: string) =>
    req<{ job_id: string; status: string; progress: number; result: Record<string, unknown> | null }>(
      `/api/jobs/${jobId}`
    ),
}
