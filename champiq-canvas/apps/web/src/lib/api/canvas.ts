// champiq-canvas/apps/web/src/lib/api/canvas.ts
import { req } from './req'
import type { CanvasState } from './types'
export type { CanvasState }

export const getCanvasState  = () => req<CanvasState>('/api/canvas/state')
// nodes/edges are React Flow types managed by @xyflow/react — typed at canvas layer
export const saveCanvasState = (nodes: unknown[], edges: unknown[]) =>
  req('/api/canvas/state', { method: 'POST', body: JSON.stringify({ nodes, edges }) })
