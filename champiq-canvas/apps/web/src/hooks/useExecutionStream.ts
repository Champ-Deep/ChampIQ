import { useEffect } from 'react'
import { useCanvasStore } from '@/store/canvasStore'

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
          const msg = JSON.parse(ev.data) as Record<string, unknown>
          handle(msg)
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

function handle(msg: Record<string, unknown>) {
  const topic = msg.topic as string | undefined
  if (!topic) return
  const nodeId = msg.node_id as string | undefined
  const store = useCanvasStore.getState()

  if (topic === 'node.started' && nodeId) {
    store.setNodeRuntime(nodeId, { status: 'running' })
    return
  }
  if (topic === 'node.completed' && nodeId) {
    store.setNodeRuntime(nodeId, {
      status: 'success',
      output: (msg.output as Record<string, unknown>) ?? undefined,
    })
    store.addLog({ nodeId, nodeName: nodeId, status: 'success', message: 'Node completed' })
    return
  }
  if (topic === 'node.failed' && nodeId) {
    store.setNodeRuntime(nodeId, { status: 'error', error: (msg.error as string) ?? 'failed' })
    store.addLog({ nodeId, nodeName: nodeId, status: 'error', message: String(msg.error ?? 'failed') })
    return
  }
  if (topic === 'execution.finished') {
    store.setIsRunningAll(false)
    store.addLog({
      nodeId: 'exec',
      nodeName: 'Execution',
      status: (msg.status as string) === 'success' ? 'success' : 'error',
      message: `Execution ${msg.execution_id} ${msg.status}`,
    })
  }
}
