import { useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { api } from '@/lib/api'
import { useCanvasStore } from '@/store/canvasStore'
import type { ChampIQManifest } from '@/types'
import champgraphJson from '@manifests/champgraph.manifest.json'
import champmailJson from '@manifests/champmail.manifest.json'
import champvoiceJson from '@manifests/champvoice.manifest.json'

// Bundled manifests — used when the API is unreachable so the canvas
// remains fully usable without a running backend.
const STATIC_MANIFESTS = [
  champgraphJson,
  champmailJson,
  champvoiceJson,
] as unknown as ChampIQManifest[]

function buildDemoCanvas(manifests: ChampIQManifest[]): { nodes: Node[]; edges: Edge[] } {
  const cg = manifests.find((m) => m['x-champiq'].tool_id === 'champgraph')
  const cm = manifests.find((m) => m['x-champiq'].tool_id === 'champmail')
  const cv = manifests.find((m) => m['x-champiq'].tool_id === 'champvoice')
  if (!cg || !cm || !cv) return { nodes: [], edges: [] }

  const nodes: Node[] = [
    {
      id: 'demo-champgraph',
      type: 'toolNode',
      position: { x: 80, y: 200 },
      data: { manifest: cg, config: { company_size: '11-50' }, toolId: 'champgraph' },
    },
    {
      id: 'demo-champmail',
      type: 'toolNode',
      position: { x: 460, y: 60 },
      data: { manifest: cm, config: { daily_limit: 50, subject: '' }, toolId: 'champmail' },
    },
    {
      id: 'demo-champvoice',
      type: 'toolNode',
      position: { x: 460, y: 360 },
      data: { manifest: cv, config: { call_window: '09:00-17:00', max_calls: 20 }, toolId: 'champvoice' },
    },
  ]

  const edges: Edge[] = [
    {
      id: 'demo-edge-graph-mail',
      source: 'demo-champgraph',
      target: 'demo-champmail',
      type: 'customEdge',
      data: { state: 'waiting' },
    },
    {
      id: 'demo-edge-graph-voice',
      source: 'demo-champgraph',
      target: 'demo-champvoice',
      type: 'customEdge',
      data: { state: 'waiting' },
    },
  ]

  return { nodes, edges }
}

export function useManifests() {
  const { setManifests, setToolHealth, setNodes, setEdges } = useCanvasStore()

  useEffect(() => {
    const applyManifests = (manifests: ChampIQManifest[]) => {
      setManifests(manifests)
      // Only place demo nodes when the canvas has no saved state.
      if (useCanvasStore.getState().nodes.length === 0) {
        const { nodes: demoNodes, edges: demoEdges } = buildDemoCanvas(manifests)
        setNodes(demoNodes)
        setEdges(demoEdges)
      }
    }

    api.getManifests()
      .then((raw) => {
        const manifests = raw as ChampIQManifest[]
        applyManifests(manifests)
        for (const m of manifests) {
          const toolId = m['x-champiq'].tool_id
          api.getToolStatus(toolId)
            .then((res) => setToolHealth(toolId, res.status === 'ok' ? 'ok' : 'error'))
            .catch(() => setToolHealth(toolId, 'error'))
        }
      })
      .catch(() => {
        // Backend unreachable — fall back to statically bundled manifests.
        applyManifests(STATIC_MANIFESTS)
        for (const m of STATIC_MANIFESTS) {
          setToolHealth(m['x-champiq'].tool_id, 'unknown')
        }
      })
  }, [setManifests, setToolHealth, setNodes, setEdges])
}
