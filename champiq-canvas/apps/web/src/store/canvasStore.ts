import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { NodeRuntimeState, LogEntry, ChampIQManifest, CanvasMeta } from '@/types'

interface CanvasStore {
  // ── Canvas content ────────────────────────────────────────────────────────
  nodes: Node[]
  edges: Edge[]
  nodeRuntimeStates: Record<string, NodeRuntimeState>
  logs: LogEntry[]
  selectedNodeId: string | null

  // ── Multi-canvas ──────────────────────────────────────────────────────────
  canvasList: CanvasMeta[]
  currentCanvasId: string
  canvasName: string

  // ── Manifests / health ────────────────────────────────────────────────────
  manifests: ChampIQManifest[]
  toolHealthStatus: Record<string, 'ok' | 'error' | 'unknown'>

  // ── Execution ─────────────────────────────────────────────────────────────
  isRunningAll: boolean

  // ── Actions ───────────────────────────────────────────────────────────────
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: Parameters<typeof applyNodeChanges>[0]) => void
  onEdgesChange: (changes: Parameters<typeof applyEdgeChanges>[0]) => void
  setManifests: (manifests: ChampIQManifest[]) => void
  setNodeRuntime: (nodeId: string, state: Partial<NodeRuntimeState>) => void
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  setSelectedNode: (nodeId: string | null) => void
  setToolHealth: (tool: string, status: 'ok' | 'error' | 'unknown') => void
  /** Renames the current canvas and keeps canvasList in sync. */
  setCanvasName: (name: string) => void
  setCanvasList: (list: CanvasMeta[]) => void
  setCurrentCanvasId: (id: string) => void
  setIsRunningAll: (v: boolean) => void
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
}

export const useCanvasStore = create<CanvasStore>()(
  subscribeWithSelector(
  (set) => ({
    nodes: [],
    edges: [],
    nodeRuntimeStates: {},
    logs: [],
    selectedNodeId: null,

    canvasList: [],
    currentCanvasId: 'default',
    canvasName: 'My Canvas',

    manifests: [],
    toolHealthStatus: {},

    isRunningAll: false,

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

    setNodeRuntime: (nodeId, state) =>
      set((prev) => ({
        nodeRuntimeStates: {
          ...prev.nodeRuntimeStates,
          [nodeId]: { ...prev.nodeRuntimeStates[nodeId], ...state },
        },
      })),

    addLog: (entry) =>
      set((s) => ({
        logs: [
          { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
          ...s.logs.slice(0, 9),
        ],
      })),

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
    setIsRunningAll: (v) => set({ isRunningAll: v }),

    updateNodeConfig: (nodeId, config) =>
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
        ),
      })),
  }))
)
