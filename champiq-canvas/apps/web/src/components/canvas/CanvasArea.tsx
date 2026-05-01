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
import { useTheme } from '@/hooks/useTheme'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '@/store/canvasStore'
import { ToolNode } from './ToolNode'
import { CustomEdge } from './CustomEdge'
import { getNodeMeta, getToolId, isEdgeCompatible } from '@/lib/manifest'
import type { ChampIQManifest } from '@/types'

function WrapNode({ data, ...props }: { data: Record<string, unknown> } & Node) {
  return <ToolNode data={data} {...props} />
}

// React Flow REQUIRES these to be stable references across renders. If
// nodeTypes / edgeTypes change identity between renders, React Flow re-mounts
// every node, which tears down and rebuilds the hooks inside each node — and
// in that transition React fires `Rendered more hooks than during the previous
// render` (minified error #310).
//
// Building these once at module scope is the standard React Flow pattern.
// Do NOT inline-spread these into the JSX prop or use a fresh object literal
// in render — that breaks stability and revives the bug.
const nodeTypes: Record<string, React.ComponentType<any>> = {
  toolNode: ToolNode,
  triggerNode: WrapNode,
  builtinNode: WrapNode,
  default: WrapNode,
}
const edgeTypes = { customEdge: CustomEdge }

export function CanvasArea() {
  const {
    nodes, edges, manifests,
    onNodesChange, onEdgesChange, setEdges,
    setSelectedNode, addLog,
  } = useCanvasStore()
  const { dark } = useTheme()

  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return

      const sourceManifest = sourceNode.data.manifest as ChampIQManifest | undefined
      const targetManifest = targetNode.data.manifest as ChampIQManifest | undefined

      // v2 / system nodes have no manifest on the node data — always allow connection
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
      // dragId is either a node kind (e.g. "trigger.manual", "if", "set")
      // or a tool_id (e.g. "champmail", "champgraph")
      const dragId = e.dataTransfer.getData('application/champiq-tool')
      if (!dragId) return

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) return

      const position = {
        x: e.clientX - bounds.left - 100,
        y: e.clientY - bounds.top - 40,
      }

      // Find matching manifest: for tool nodes match on tool_id,
      // for system node kinds find the parent manifest that contains this kind
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
    <div ref={reactFlowWrapper} className="flex-1 h-full">
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
        onPaneClick={() => setSelectedNode(null)}
        colorMode={dark ? 'dark' : 'light'}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2d3a" />
        <Controls className="bg-slate-800 border border-slate-700" />
        <MiniMap
          nodeColor={(n) => {
            const m = n.data?.manifest as ChampIQManifest | undefined
            return m ? getNodeMeta(m).color : '#666'
          }}
          maskColor="rgba(15,17,23,0.8)"
        />
      </ReactFlow>
    </div>
  )
}
