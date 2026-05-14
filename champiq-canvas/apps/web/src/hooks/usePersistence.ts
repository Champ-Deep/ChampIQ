import { useEffect, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { api } from '@/lib/api'
import { useCanvasStore } from '@/store/canvasStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { CanvasMeta } from '@/types'

// ── localStorage key scheme ───────────────────────────────────────────────────
//   champiq:canvas:list               → CanvasMeta[]  (default workspace)
//   champiq:canvas:list:{workspaceId} → CanvasMeta[]  (non-default workspace)
//   champiq:canvas:{id}               → { nodes, edges }

/** Saves the current canvas to localStorage and best-effort syncs to the API. */
export function saveCurrentCanvas() {
  const { nodes, edges, currentCanvasId, canvasName, canvasList } = useCanvasStore.getState()
  const listKey = useWorkspaceStore.getState().canvasListKey()

  localStorage.setItem(`champiq:canvas:${currentCanvasId}`, JSON.stringify({ nodes, edges }))

  const meta: CanvasMeta = { id: currentCanvasId, name: canvasName, updatedAt: new Date().toISOString() }
  const updated = canvasList.some((c) => c.id === currentCanvasId)
    ? canvasList.map((c) => (c.id === currentCanvasId ? { ...c, name: meta.name, updatedAt: meta.updatedAt } : c))
    : [...canvasList, meta]
  useCanvasStore.setState({ canvasList: updated })
  localStorage.setItem(listKey, JSON.stringify(updated))

  api.saveCanvasState(nodes, edges).catch(() => {})
}

// Strip fields that should never be manually configured — they flow from loop item automatically
function migrateNodes(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    if ((n.data as Record<string, unknown>)?.kind === 'champvoice') {
      const config = ((n.data as Record<string, unknown>)?.config as Record<string, unknown>) || {}
      const inputs = { ...(config.inputs as Record<string, unknown> || {}) }
      delete inputs['to_number']
      delete inputs['first_name']
      delete inputs['last_name']
      delete inputs['phone_number']
      delete inputs['phone']
      delete inputs['lead_name']
      delete inputs['email']
      delete inputs['company']
      return { ...n, data: { ...n.data, config: { ...config, inputs } } }
    }
    return n
  })
}

/** Public: load a canvas by ID from localStorage. Returns null if not found. */
export function loadCanvasFromStorage(id: string): { nodes: Node[]; edges: Edge[] } | null {
  const raw = localStorage.getItem(`champiq:canvas:${id}`)
  if (!raw) return null
  try {
    const { nodes, edges } = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] }
    // Deduplicate, strip orphan edges, migrate stale configs
    const uniqueNodes = migrateNodes(
      nodes.filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i)
    )
    const nodeIds = new Set(uniqueNodes.map(n => n.id))
    const uniqueEdges = edges
      .filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    return { nodes: uniqueNodes, edges: uniqueEdges }
  } catch {
    return null
  }
}

export function usePersistence() {
  const { setNodes, setEdges, setIsLoadingCanvases } = useCanvasStore()
  const currentCanvasId = useCanvasStore((s) => s.currentCanvasId)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 1. Initialise canvas list from localStorage (runs once on mount).
  useEffect(() => {
    const listKey = useWorkspaceStore.getState().canvasListKey()
    const raw = localStorage.getItem(listKey)
    let list: CanvasMeta[] = raw ? (JSON.parse(raw) as CanvasMeta[]) : []

    // Deduplicate by ID
    list = list.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)

    // Also remove the stale flat key written by old persist middleware
    localStorage.removeItem('champiq:canvas')

    if (list.length > 0) {
      const first = list[0]
      useCanvasStore.setState({ canvasList: list, currentCanvasId: first.id, canvasName: first.name })
      localStorage.setItem(listKey, JSON.stringify(list))
    } else {
      const id = crypto.randomUUID()
      const meta: CanvasMeta = { id, name: 'My Canvas', updatedAt: new Date().toISOString() }
      useCanvasStore.setState({ canvasList: [meta], currentCanvasId: id })
      localStorage.setItem(listKey, JSON.stringify([meta]))
    }
    setIsLoadingCanvases(false)
  }, [])

  // 2. Load canvas state when active canvas ID changes.
  //    openCanvas/newCanvas already do a synchronous setState (nodes+ID together)
  //    so this effect is a safety net for the initial mount only.
  //    Do NOT pre-clear nodes here — that caused a one-frame flash of the old
  //    canvas's nodes on every switch.
  useEffect(() => {
    const saved = loadCanvasFromStorage(currentCanvasId)
    setNodes(saved?.nodes ?? [])
    setEdges(saved?.edges ?? [])
  }, [currentCanvasId, setNodes, setEdges])

  // 3. Debounced save on ANY store change (nodes, edges, or config updates).
  //    1s debounce — short enough to capture config changes before Run All.
  useEffect(() => {
    const unsub = useCanvasStore.subscribe(
      (s) => [s.nodes, s.edges] as const,
      () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(saveCurrentCanvas, 1_000)
      }
    )
    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])
}
