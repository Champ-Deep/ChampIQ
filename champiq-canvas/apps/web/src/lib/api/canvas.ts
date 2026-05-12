// champiq-canvas/apps/web/src/lib/api/canvas.ts
import { req } from './req'
import type { CanvasState } from './types'
export type { CanvasState }

export const getCanvasState  = () => req<CanvasState>('/api/canvas/state')
export const saveCanvasState = (nodes: unknown[], edges: unknown[]) =>
  req('/api/canvas/state', { method: 'POST', body: JSON.stringify({ nodes, edges }) })
