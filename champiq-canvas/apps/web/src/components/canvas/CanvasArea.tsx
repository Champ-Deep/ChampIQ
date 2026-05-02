import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  type Connection,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '@/store/canvasStore'
import { ToolNode } from './ToolNode'
import { CustomEdge } from './CustomEdge'
import { getNodeMeta, getToolId, isEdgeCompatible } from '@/lib/manifest'
import type { ChampIQManifest } from '@/types'

function WrapNode({ data, ...props }: { data: Record<string, unknown> } & Node) {
  return <ToolNode data={data} {...props} type={(props as { type?: string }).type ?? 'toolNode'} />
}

// React Flow REQUIRES nodeTypes / edgeTypes to be stable references across
// renders. If their identity changes, React Flow re-mounts every node, which
// tears down and rebuilds the hooks inside each node — and in that transition
// React fires `Rendered more hooks than during the previous render` (minified
// error #310). Build these once at module scope. Do NOT inline-spread or use a
// fresh object literal in the JSX prop — that breaks stability and revives the
// bug.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, React.ComponentType<any>> = {
  toolNode: ToolNode,
  triggerNode: WrapNode,
  builtinNode: WrapNode,
  default: WrapNode,
}
const edgeTypes = { customEdge: CustomEdge }

interface CanvasAreaProps {
  onNodeOpen?: (nodeId: string) => void
}

export function CanvasArea({ onNodeOpen }: CanvasAreaProps) {
  const {
    nodes, edges, manifests,
    onNodesChange, onEdgesChange, setEdges,
    setSelectedNode, addLog,
  } = useCanvasStore()

  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return

      const sourceManifest = sourceNode.data.manifest as ChampIQManifest | undefined
      const targetManifest = targetNode.data.manifest as ChampIQManifest | undefined

      if (sourceManifest && targetManifest) {
        const sourceToolId = getToolId(sourceManifest)
        if (!isEdgeCompatible(sourceToolId, targetManifest)) {
          const targetMeta = getNodeMeta(targetManifest)
          const sourceMeta = getNodeMeta(sourceManifest)
          addLog({
            nodeId: targetNode.id,
            nodeName: targetMeta.label,
            status: 'error',
            message: `Edge rejected: ${targetMeta.label} does not accept input from ${sourceMeta.label}`,
          })
          return
        }
      }

      setEdges(addEdge({ ...connection, type: 'customEdge', data: { state: 'waiting' } }, edges))
    },
    [nodes, edges, setEdges, addLog]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const dragId = e.dataTransfer.getData('application/champiq-tool')
      if (!dragId) return

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) return

      const position = {
        x: e.clientX - bounds.left - 100,
        y: e.clientY - bounds.top - 40,
      }

      const toolManifest = manifests.find((m) => getToolId(m) === dragId)
      const isNodeKind = !toolManifest

      const newNode = {
        id: `${dragId}-${Date.now()}`,
        type: 'toolNode',
        position,
        data: isNodeKind
          ? { kind: dragId, config: {}, label: dragId }
          : { manifest: toolManifest, config: {}, toolId: dragId, kind: dragId },
      }

      useCanvasStore.setState((state) => ({ nodes: [...state.nodes, newNode] }))
    },
    [manifests]
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  return (
    <div ref={reactFlowWrapper} style={{ flex: 1, height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onNodeDoubleClick={(_, node) => onNodeOpen?.(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        deleteKeyCode={['Delete', 'Backspace']}
        colorMode="dark"
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(124,92,255,0.12)"
        />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const m = n.data?.manifest as ChampIQManifest | undefined
            if (m) return getNodeMeta(m).color
            const kind = (n.data?.kind as string) || ''
            const colorMap: Record<string, string> = {
              champmail: '#22C55E', champgraph: '#3B82F6', champvoice: '#A855F7',
              loop: '#F59E0B', if: '#EF4444', trigger: '#10B981',
            }
            for (const [k, c] of Object.entries(colorMap)) {
              if (kind.includes(k)) return c
            }
            return '#525C7A'
          }}
          maskColor="rgba(7,9,18,0.85)"
          style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)' }}
        />
      </ReactFlow>
    </div>
  )
}
