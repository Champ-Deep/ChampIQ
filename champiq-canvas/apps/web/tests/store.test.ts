import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from '@/store/canvasStore'

beforeEach(() => {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    manifests: [],
    nodeRuntimeStates: {},
    logs: [],
    selectedNodeId: null,
    toolHealthStatus: {},
    canvasName: 'My Canvas',
  })
})

describe('canvasStore', () => {
  it('adds a node runtime state', () => {
    useCanvasStore.getState().setNodeRuntime('node-1', { status: 'running' })
    expect(useCanvasStore.getState().nodeRuntimeStates['node-1'].status).toBe('running')
  })

  it('keeps only the last 10 logs', () => {
    const store = useCanvasStore.getState()
    for (let i = 0; i < 12; i++) {
      store.addLog({ nodeId: 'n', nodeName: 'Test', status: 'idle', message: `msg ${i}` })
    }
    expect(useCanvasStore.getState().logs).toHaveLength(10)
  })

  it('updates node config', () => {
    useCanvasStore.setState({
      nodes: [{ id: 'n1', type: 'toolNode', position: { x: 0, y: 0 }, data: { config: {} } }],
    })
    useCanvasStore.getState().updateNodeConfig('n1', { industry: 'SaaS' })
    const node = useCanvasStore.getState().nodes.find((n) => n.id === 'n1')!
    expect((node.data as Record<string, unknown>).config).toEqual({ industry: 'SaaS' })
  })

  it('selects and deselects a node', () => {
    useCanvasStore.getState().setSelectedNode('node-abc')
    expect(useCanvasStore.getState().selectedNodeId).toBe('node-abc')
    useCanvasStore.getState().setSelectedNode(null)
    expect(useCanvasStore.getState().selectedNodeId).toBeNull()
  })

  it('sets tool health status', () => {
    useCanvasStore.getState().setToolHealth('champgraph', 'ok')
    expect(useCanvasStore.getState().toolHealthStatus['champgraph']).toBe('ok')
  })
})
