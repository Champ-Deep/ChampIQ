import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { ChampIQManifest, CanvasMeta } from '@/types'
import { useExecutionStore } from './executionStore'
import { useWorkspaceStore } from './workspaceStore'

interface CanvasStore {
  // ── Canvas content ────────────────────────────────────────────────────────
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null

  // ── Multi-canvas ──────────────────────────────────────────────────────────
  canvasList: CanvasMeta[]
  currentCanvasId: string
  canvasName: string
  isLoadingCanvases: boolean

  // ── Manifests / health ────────────────────────────────────────────────────
  manifests: ChampIQManifest[]
  toolHealthStatus: Record<string, 'ok' | 'error' | 'unknown'>

  // ── Actions ───────────────────────────────────────────────────────────────
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: Parameters<typeof applyNodeChanges>[0]) => void
  onEdgesChange: (changes: Parameters<typeof applyEdgeChanges>[0]) => void
  setManifests: (manifests: ChampIQManifest[]) => void
  setSelectedNode: (nodeId: string | null) => void
  setToolHealth: (tool: string, status: 'ok' | 'error' | 'unknown') => void
  /** Renames the current canvas and keeps canvasList in sync. */
  setCanvasName: (name: string) => void
  setCanvasList: (list: CanvasMeta[]) => void
  setCurrentCanvasId: (id: string) => void
  setIsLoadingCanvases: (loading: boolean) => void
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  clearCanvas: () => void
  archiveCanvas: (id: string) => void
  restoreCanvas: (id: string) => void
  /** Returns trigger descriptors for all cron nodes — used by Activate. */
  getCronTriggers: () => Array<{ id: string; kind: 'cron'; cron: string; timezone: string }>
}

export const useCanvasStore = create<CanvasStore>()(
  subscribeWithSelector(
  (set, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,

    canvasList: [],
    currentCanvasId: 'default',
    canvasName: 'My Canvas',
    isLoadingCanvases: true,

    manifests: [],
    toolHealthStatus: {},

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),

    onNodesChange: (changes) =>
      set((s) => {
        const nodes = applyNodeChanges(changes, s.nodes)
        const nodeIds = new Set(nodes.map((n) => n.id))
        const edges = s.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        return { nodes, edges }
      }),

    onEdgesChange: (changes) =>
      set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

    setManifests: (manifests) => set({ manifests }),

    setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

    setToolHealth: (tool, status) =>
      set((s) => ({ toolHealthStatus: { ...s.toolHealthStatus, [tool]: status } })),

    setCanvasName: (name) =>
      set((s) => ({
        canvasName: name,
        canvasList: s.canvasList.map((c) =>
          c.id === s.currentCanvasId ? { ...c, name } : c
        ),
      })),

    setCanvasList: (list) => set({ canvasList: list }),
    setCurrentCanvasId: (id) => set({ currentCanvasId: id }),
    setIsLoadingCanvases: (loading) => set({ isLoadingCanvases: loading }),

    archiveCanvas: (id) => {
      const canvasList = get().canvasList.map((c) =>
        c.id === id ? { ...c, archived: true } : c
      )
      set({ canvasList })
      const key = useWorkspaceStore.getState().canvasListKey()
      try { localStorage.setItem(key, JSON.stringify(canvasList)) } catch { /* noop */ }
    },

    restoreCanvas: (id) => {
      const canvasList = get().canvasList.map((c) =>
        c.id === id ? { ...c, archived: false } : c
      )
      set({ canvasList })
      const key = useWorkspaceStore.getState().canvasListKey()
      try { localStorage.setItem(key, JSON.stringify(canvasList)) } catch { /* noop */ }
    },

    updateNodeConfig: (nodeId, config) =>
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
        ),
      })),

    clearCanvas: () => {
      useExecutionStore.getState().clearExecution()
      set({ nodes: [], edges: [] })
    },

    getCronTriggers: () => {
      return get().nodes
        .filter((n) => (n.data as { kind?: string }).kind === 'trigger.cron')
        .map((n) => {
          const cfg = (n.data as { config?: Record<string, unknown> }).config ?? {}
          return {
            id: n.id,
            kind: 'cron' as const,
            cron: (cfg.cron as string) ?? '0 9 * * 1-5',
            timezone: (cfg.timezone as string) ?? 'UTC',
          }
        })
    },
  }))
)
