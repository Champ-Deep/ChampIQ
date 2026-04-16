import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useCanvasStore } from '@/store/canvasStore'

export function useJobPolling(jobId: string | undefined, nodeId: string, toolId: string) {
  const { setNodeRuntime, addLog } = useCanvasStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!jobId) return

    intervalRef.current = setInterval(async () => {
      try {
        const job = await api.getJob(jobId)

        if (job.status === 'done') {
          setNodeRuntime(nodeId, { status: 'success', output: job.result ?? undefined })
          addLog({ nodeId, nodeName: toolId, status: 'success', message: `Job ${jobId} completed.` })

          const { nodes, edges, isRunningAll } = useCanvasStore.getState()
          const outgoingEdges = edges.filter((e) => e.source === nodeId)
          for (const edge of outgoingEdges) {
            const targetNode = nodes.find((n) => n.id === edge.target)
            if (targetNode && job.result) {
              const records = (job.result as Record<string, unknown>).records
              useCanvasStore.getState().setNodeRuntime(edge.target, {
                inputPayload: { prospects: Array.isArray(records) ? records : [] },
              })
            }
          }

          // Run All: trigger downstream nodes whose all dependencies are now done.
          if (isRunningAll) {
            const rts = useCanvasStore.getState().nodeRuntimeStates
            for (const edge of outgoingEdges) {
              const incoming = edges.filter((e) => e.target === edge.target)
              const allDone = incoming.every(
                (e) => rts[e.source]?.status === 'success'
              )
              if (allDone) {
                useCanvasStore.getState().setNodeRuntime(edge.target, { pendingRun: true })
              }
            }

            // Stop isRunningAll when every node is terminal.
            const latest = useCanvasStore.getState().nodeRuntimeStates
            const allSettled = useCanvasStore.getState().nodes.every((n) => {
              const s = latest[n.id]?.status
              return s === 'success' || s === 'error'
            })
            if (allSettled) useCanvasStore.setState({ isRunningAll: false })
          }

          clearInterval(intervalRef.current!)
          intervalRef.current = null
        } else if (job.status === 'error') {
          setNodeRuntime(nodeId, { status: 'error', error: 'Job failed.' })
          addLog({ nodeId, nodeName: toolId, status: 'error', message: `Job ${jobId} failed.` })
          clearInterval(intervalRef.current!)
          intervalRef.current = null
        }
      } catch {
        // Network error. Keep polling.
      }
    }, 5000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobId, nodeId, toolId, setNodeRuntime, addLog])
}
