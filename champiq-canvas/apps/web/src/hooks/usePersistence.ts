import { useEffect, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { api } from '@/lib/api'
import { useCanvasStore } from '@/store/canvasStore'
import type { CanvasMeta } from '@/types'

// ── localStorage key scheme ───────────────────────────────────────────────────
//   champiq:canvas:list      → CanvasMeta[]       (index of all canvases)
//   champiq:canvas:{id}      → { nodes, edges }   (per-canvas state)

/** Saves the current canvas to localStorage and best-effort syncs to the API. */
export function saveCurrentCanvas() {
  const { nodes, edges, currentCanvasId, canvasName, canvasList } = useCanvasStore.getState()

  localStorage.setItem(`champiq:canvas:${currentCanvasId}`, JSON.stringify({ nodes, edges }))

  const meta: CanvasMeta = { id: currentCanvasId, name: canvasName, updatedAt: new Date().toISOString() }
  const updated = canvasList.some((c) => c.id === currentCanvasId)
    ? canvasList.map((c) => (c.id === currentCanvasId ? meta : c))
    : [...canvasList, meta]
  useCanvasStore.setState({ canvasList: updated })
  localStorage.setItem('champiq:canvas:list', JSON.stringify(updated))

  api.saveCanvasState(nodes, edges).catch(() => {})
}

export function usePersistence() {
  const { setNodes, setEdges } = useCanvasStore()
  const currentCanvasId = useCanvasStore((s) => s.currentCanvasId)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 1. Initialise canvas list from localStorage (runs once on mount).
  useEffect(() => {
    const raw = localStorage.getItem('champiq:canvas:list')
    const list: CanvasMeta[] = raw ? (JSON.parse(raw) as CanvasMeta[]) : []

    if (list.length > 0) {
      const first = list[0]
      useCanvasStore.setState({ canvasList: list, currentCanvasId: first.id, canvasName: first.name })
    } else {
      const id = crypto.randomUUID()
      const meta: CanvasMeta = { id, name: 'My Canvas', updatedAt: new Date().toISOString() }
      useCanvasStore.setState({ canvasList: [meta], currentCanvasId: id })
      localStorage.setItem('champiq:canvas:list', JSON.stringify([meta]))
    }
  }, [])

  // 2. Load canvas state whenever the active canvas ID changes.
  useEffect(() => {
    const raw = localStorage.getItem(`champiq:canvas:${currentCanvasId}`)
    if (raw) {
      try {
        const { nodes, edges } = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] }
        setNodes(nodes)
        setEdges(edges)
        return
      } catch { /* ignore corrupt data */ }
    }
    // Fallback: try the API (works when backend is running).
    api.getCanvasState().then((s) => {
      if (s.nodes.length > 0 || s.edges.length > 0) {
        setNodes(s.nodes as Node[])
        setEdges(s.edges as Edge[])
      }
    }).catch(() => {})
  }, [currentCanvasId, setNodes, setEdges])

  // 3. Debounced save (3 s) whenever nodes change.
  useEffect(() => {
    const unsub = useCanvasStore.subscribe(
      (s) => s.nodes,
      () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(saveCurrentCanvas, 3_000)
      }
    )
    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])
}
