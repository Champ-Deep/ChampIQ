/**
 * Applies a chat-generated WorkflowPatch to the canvas store.
 * SRP: this is the ONLY place that translates LLM output into canvas mutations.
 */
import type { Node, Edge } from '@xyflow/react'
import { useCanvasStore } from '@/store/canvasStore'
import type { WorkflowPatch } from '@/types'

type NodePatch = Partial<Node> & { id?: string; data?: Record<string, unknown>; position?: { x: number; y: number } }
type EdgePatch = Partial<Edge> & { id?: string; source?: string; target?: string }

export function applyWorkflowPatch(patch: WorkflowPatch): { added: number; removed: number; updated: number } {
  if (!patch) return { added: 0, removed: 0, updated: 0 }

  const store = useCanvasStore.getState()
  const removeIds = new Set(patch.remove_node_ids ?? [])

  let nodes = store.nodes.filter((n) => !removeIds.has(n.id))
  let edges = store.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target))

  let updated = 0
  for (const u of patch.update_nodes ?? []) {
    nodes = nodes.map((n) => {
      if (n.id !== u.id) return n
      updated++
      return { ...n, data: { ...(n.data as object), ...(u.data as object) } }
    })
  }

  const laidOut = laidOutPosition(nodes.length)
  const added = (patch.add_nodes ?? []).map((raw, i) => {
    const n = raw as NodePatch
    const id = n.id ?? `${(n.data as { kind?: string } | undefined)?.kind ?? 'node'}-${Date.now()}-${i}`
    return {
      id,
      type: n.type ?? 'toolNode',
      position: n.position ?? laidOut(i),
      data: (n.data as Record<string, unknown>) ?? {},
    } as Node
  })
  nodes = [...nodes, ...added]

  const addedEdges = (patch.add_edges ?? []).map((raw, i) => {
    const e = raw as EdgePatch
    return {
      id: e.id ?? `e-${Date.now()}-${i}`,
      source: e.source ?? '',
      target: e.target ?? '',
      type: e.type ?? 'customEdge',
      sourceHandle: (e as { sourceHandle?: string }).sourceHandle ?? null,
      data: (e as { data?: Record<string, unknown> }).data ?? { state: 'waiting' },
    } as Edge
  })
  edges = [...edges, ...addedEdges]

  useCanvasStore.setState({ nodes, edges })
  return { added: added.length, removed: removeIds.size, updated }
}

function laidOutPosition(existingCount: number) {
  return (i: number) => {
    const idx = existingCount + i
    const col = idx % 3
    const row = Math.floor(idx / 3)
    return { x: 80 + col * 260, y: 80 + row * 160 }
  }
}
