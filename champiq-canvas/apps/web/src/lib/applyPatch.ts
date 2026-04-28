/**
 * Applies a chat-generated WorkflowPatch to the canvas store.
 * SRP: this is the ONLY place that translates LLM output into canvas mutations.
 */
import type { Node, Edge } from '@xyflow/react'
import { useCanvasStore } from '@/store/canvasStore'
import type { WorkflowPatch } from '@/types'

type NodePatch = Partial<Node> & { id?: string; data?: Record<string, unknown>; position?: { x: number; y: number } }
type EdgePatch = Partial<Edge> & { id?: string; source?: string; target?: string }

export function applyWorkflowPatch(patch: WorkflowPatch): { added: number; removed: number; updated: number; addedIds: string[] } {
  if (!patch) return { added: 0, removed: 0, updated: 0, addedIds: [] }

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

  const laidOut = linearPosition(nodes)
  const addedNodes = (patch.add_nodes ?? []).map((raw, i) => {
    const n = raw as NodePatch
    const id = n.id ?? `${(n.data as { kind?: string } | undefined)?.kind ?? 'node'}-${Date.now()}-${i}`
    return {
      id,
      type: n.type ?? 'toolNode',
      position: n.position ?? laidOut(i),
      data: (n.data as Record<string, unknown>) ?? {},
    } as Node
  })
  // Deduplicate: if an add_node ID already exists, treat it as an update instead.
  const existingIds = new Set(nodes.map((n) => n.id))
  const trulyNew: Node[] = []
  for (const n of addedNodes) {
    if (existingIds.has(n.id)) {
      nodes = nodes.map((existing) =>
        existing.id === n.id
          ? { ...existing, data: { ...(existing.data as object), ...(n.data as object) } }
          : existing
      )
    } else {
      trulyNew.push(n)
      existingIds.add(n.id)
    }
  }
  nodes = [...nodes, ...trulyNew]

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
  // Deduplicate edges by ID too
  const edgeMap = new Map(edges.map((e) => [e.id, e]))
  for (const e of addedEdges) edgeMap.set(e.id, e)
  edges = Array.from(edgeMap.values())

  useCanvasStore.setState({ nodes, edges })
  return { added: trulyNew.length, removed: removeIds.size, updated, addedIds: trulyNew.map((n) => n.id) }
}

// Linear left-to-right layout: each new node steps 280px right from the rightmost existing node.
// Branch nodes (y specified by LLM) keep their y; unpositioned ones go at y=300.
function linearPosition(existingNodes: Node[]) {
  const maxX = existingNodes.length > 0
    ? Math.max(...existingNodes.map((n) => n.position.x))
    : -200
  return (i: number) => ({
    x: maxX + 280 + i * 280,
    y: 300,
  })
}
