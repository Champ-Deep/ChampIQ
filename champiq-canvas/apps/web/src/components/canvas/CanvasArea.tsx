import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  type Connection,
} from '@xyflow/react'
import { useTheme } from '@/hooks/useTheme'
import '@xyflow/react/dist/style.css'
import { useCanvasStore } from '@/store/canvasStore'
import { ToolNode } from './ToolNode'
import { CustomEdge } from './CustomEdge'
import { getNodeMeta, getToolId, isEdgeCompatible } from '@/lib/manifest'
import type { ChampIQManifest } from '@/types'

const nodeTypes = { toolNode: ToolNode }
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
      if (!sourceManifest || !targetManifest) return

      const sourceToolId = getToolId(sourceManifest)
      const targetMeta = getNodeMeta(targetManifest)
      const sourceMeta = getNodeMeta(sourceManifest)

      if (!isEdgeCompatible(sourceToolId, targetManifest)) {
        addLog({
          nodeId: targetNode.id,
          nodeName: targetMeta.label,
          status: 'error',
          message: `Edge rejected: ${targetMeta.label} does not accept input from ${sourceMeta.label}`,
        })
        return
      }

      setEdges(addEdge({ ...connection, type: 'customEdge', data: { state: 'waiting' } }, edges))
    },
    [nodes, edges, setEdges, addLog]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const toolId = e.dataTransfer.getData('application/champiq-tool')
      if (!toolId) return

      const manifest = manifests.find((m) => getToolId(m) === toolId)
      if (!manifest) return

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!bounds) return

      const position = {
        x: e.clientX - bounds.left - 100,
        y: e.clientY - bounds.top - 40,
      }

      const newNode = {
        id: `${toolId}-${Date.now()}`,
        type: 'toolNode',
        position,
        data: { manifest, config: {}, toolId, kind: toolId },
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
