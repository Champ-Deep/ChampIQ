import type { Node, Edge } from '@xyflow/react'

/**
 * Returns node IDs grouped into execution layers via topological sort.
 * Layer 0 = source nodes (no incoming edges). Run first.
 * Layer N = all dependencies are in earlier layers.
 */
export function topoLayers(nodes: Node[], edges: Edge[]): string[][] {
  const inDegree = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]))

  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    adj.get(e.source)?.push(e.target)
  }

  const layers: string[][] = []
  let frontier = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id)

  while (frontier.length > 0) {
    layers.push(frontier)
    const next: string[] = []
    for (const id of frontier) {
      for (const target of adj.get(id) ?? []) {
        const deg = (inDegree.get(target) ?? 1) - 1
        inDegree.set(target, deg)
        if (deg === 0) next.push(target)
      }
    }
    frontier = next
  }

  return layers
}
