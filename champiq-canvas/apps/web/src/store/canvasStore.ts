import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { ChampIQManifest, CanvasMeta } from '@/types'
import { useExecutionStore } from './executionStore'

interface CanvasStore {
  // ── Canvas content ────────────────────────────────────────────────────────
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null

  // ── Multi-canvas ──────────────────────────────────────────────────────────
  canvasList: CanvasMeta[]
  currentCanvasId: string
  canvasName: string

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
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  clearCanvas: () => void
}

export const useCanvasStore = create<CanvasStore>()(
  subscribeWithSelector(
  (set) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,

    canvasList: [],
    currentCanvasId: 'default',
    canvasName: 'My Canvas',

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
  }))
)
