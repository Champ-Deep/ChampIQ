import { useEffect } from 'react'
import { useExecutionStore } from '@/store/executionStore'

// ── Domain event union — the seam between the WS wire format and the store ──

type CanvasEvent =
  | { topic: 'node.started';       node_id: string }
  | { topic: 'node.completed';     node_id: string; output: Record<string, unknown> }
  | { topic: 'node.failed';        node_id: string; error: string }
  | { topic: 'execution.finished'; execution_id: string; status: 'success' | 'error' }

function parseEvent(raw: unknown): CanvasEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const msg = raw as Record<string, unknown>
  const topic = msg.topic
  const node_id = msg.node_id

  if (topic === 'node.started' && typeof node_id === 'string') {
    return { topic: 'node.started', node_id }
  }
  if (topic === 'node.completed' && typeof node_id === 'string') {
    return { topic: 'node.completed', node_id, output: (msg.output as Record<string, unknown>) ?? {} }
  }
  if (topic === 'node.failed' && typeof node_id === 'string') {
    return { topic: 'node.failed', node_id, error: String(msg.error ?? 'failed') }
  }
  if (topic === 'execution.finished' && typeof msg.execution_id === 'string') {
    const status = msg.status === 'success' ? 'success' : 'error'
    return { topic: 'execution.finished', execution_id: msg.execution_id, status }
  }
  return null
}

function dispatch(event: CanvasEvent) {
  const store = useExecutionStore.getState()
  switch (event.topic) {
    case 'node.started':
      store.setNodeRuntime(event.node_id, { status: 'running' })
      break
    case 'node.completed':
      store.setNodeRuntime(event.node_id, { status: 'success', output: event.output })
      store.addLog({ nodeId: event.node_id, nodeName: event.node_id, status: 'success', message: 'Node completed' })
      break
    case 'node.failed':
      store.setNodeRuntime(event.node_id, { status: 'error', error: event.error })
      store.addLog({ nodeId: event.node_id, nodeName: event.node_id, status: 'error', message: event.error })
      break
    case 'execution.finished':
      store.setIsRunningAll(false)
      store.addLog({
        nodeId: 'exec',
        nodeName: 'Execution',
        status: event.status,
        message: `Execution ${event.execution_id} ${event.status}`,
      })
      break
  }
}

export function useExecutionStream() {
  useEffect(() => {
    const url = new URL('/ws/events', window.location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null

    const open = () => {
      ws = new WebSocket(url.toString())
      ws.onmessage = (ev) => {
        try {
          const event = parseEvent(JSON.parse(ev.data))
          if (event) dispatch(event)
        } catch {
          /* ignore malformed */
        }
      }
      ws.onclose = () => {
        retry = setTimeout(open, 2000)
      }
      ws.onerror = () => ws?.close()
    }

    open()
    return () => {
      if (retry) clearTimeout(retry)
      ws?.close()
    }
  }, [])
}
