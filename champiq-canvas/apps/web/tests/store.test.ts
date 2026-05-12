import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from '@/store/canvasStore'
import { useExecutionStore } from '@/store/executionStore'

beforeEach(() => {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    manifests: [],
    selectedNodeId: null,
    toolHealthStatus: {},
    canvasName: 'My Canvas',
  })
  useExecutionStore.setState({
    nodeRuntimeStates: {},
    logs: [],
    isRunningAll: false,
  })
})

describe('canvasStore', () => {
  it('adds a node runtime state', () => {
    useExecutionStore.getState().setNodeRuntime('node-1', { status: 'running' })
    expect(useExecutionStore.getState().nodeRuntimeStates['node-1'].status).toBe('running')
  })

  it('keeps only the last 10 logs', () => {
    const store = useExecutionStore.getState()
    for (let i = 0; i < 12; i++) {
      store.addLog({ nodeId: 'n', nodeName: 'Test', status: 'idle', message: `msg ${i}` })
    }
    expect(useExecutionStore.getState().logs).toHaveLength(10)
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

  it('clearCanvas resets execution state', () => {
    // Put something in both stores
    useExecutionStore.getState().setNodeRuntime('n1', { status: 'success' } as any)
    useExecutionStore.getState().addLog({ level: 'info', message: 'test' } as any)
    useCanvasStore.setState({ nodes: [{ id: 'n1' }] as any })

    // clearCanvas should clear both
    useCanvasStore.getState().clearCanvas()

    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    expect(useExecutionStore.getState().nodeRuntimeStates).toEqual({})
    expect(useExecutionStore.getState().logs).toHaveLength(0)
  })
})
